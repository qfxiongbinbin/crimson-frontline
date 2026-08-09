import {
  BUILDABLE_KINDS,
  BUILDING_KINDS,
  BUILDING_STATS,
  BUILD_PREREQ,
  FORTIFICATION_KINDS,
  UNIT_KINDS,
  UNIT_STATS,
  WORLD_H,
  WORLD_W,
  type BuildingKind,
  type UnitKind,
} from '../config';
import type { HudSnapshot } from '../types';
import type { GameScene } from '../scenes/GameScene';

const MINIMAP_SIZE = 192;
const RADAR_POWER_REQUIRED = 30;
type BuildTab = 'buildings' | 'fortifications' | 'units';

/** DOM HUD：顶部资源栏、右侧雷达建造面板、底部选中信息、胜负遮罩 */
export class HUD {
  private game: Phaser.Game;
  private scene: GameScene | null = null;

  private creditsEl!: HTMLElement;
  private powerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private queueEl!: HTMLElement;
  private selEl!: HTMLElement;
  private minimap!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private radarEl!: HTMLElement;
  private radarStatusEl!: HTMLElement;
  private radarOnline = false;
  private terrainCache: HTMLCanvasElement | null = null;
  private terrainRevision = -1;
  private overlayEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private helpCloseBtn!: HTMLButtonElement;
  private hasStarted = false;
  private toastTimer = 0;
  private tab: BuildTab = 'buildings';
  private tabButtons = new Map<BuildTab, HTMLButtonElement>();
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(game: Phaser.Game) {
    this.game = game;
    this.buildDom();
    window.setInterval(() => this.refresh(), 120);
  }

  private getScene(): GameScene | null {
    if (this.scene && this.scene.sys.isActive() && this.scene.map) return this.scene;
    const s = this.game.scene.getScene('game') as GameScene | null;
    if (s && s.sys.isActive() && s.map) {
      this.scene = s;
      return s;
    }
    return null;
  }

  private el(tag: string, id: string, parent: HTMLElement, text = ''): HTMLElement {
    const e = document.createElement(tag);
    e.id = id;
    if (text) e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  private buildDom(): void {
    const root = document.getElementById('ui')!;

    // 顶部栏
    const top = this.el('div', 'topbar', root);
    const title = this.el('span', 'topbar-title', top, '赤色前线：黎明协议');
    title.setAttribute('aria-hidden', 'true');
    this.creditsEl = this.el('span', 'credits', top, '💰 0');
    this.powerEl = this.el('span', 'power', top, '⚡ 0/0');
    this.toastEl = this.el('span', 'toast', top, '');
    const helpBtn = document.createElement('button');
    helpBtn.id = 'help-btn';
    helpBtn.textContent = '❓ 帮助';
    helpBtn.onclick = () => this.toggleHelp(true);
    top.appendChild(helpBtn);

    // 右侧面板
    this.panelEl = this.el('div', 'panel', root);

    // 雷达：剩余电力达到门槛后才显示地图
    this.radarEl = this.el('section', 'radar', this.panelEl);
    const radarHeader = this.el('div', 'radar-header', this.radarEl);
    this.el('span', 'radar-title', radarHeader, '战术雷达');
    this.radarStatusEl = this.el('span', 'radar-status', radarHeader, '离线 · 余电 0');
    const radarScreen = this.el('div', 'radar-screen', this.radarEl);
    this.minimap = document.createElement('canvas');
    this.minimap.width = MINIMAP_SIZE;
    this.minimap.height = MINIMAP_SIZE;
    radarScreen.appendChild(this.minimap);
    this.minimapCtx = this.minimap.getContext('2d')!;
    const radarOffline = this.el('div', 'radar-offline', radarScreen);
    radarOffline.innerHTML = `<strong>雷达离线</strong><span>需要 ${RADAR_POWER_REQUIRED} 点剩余电力</span>`;

    const jump = (ev: MouseEvent) => {
      if (!this.radarOnline) return;
      const r = this.minimap.getBoundingClientRect();
      const wx = ((ev.clientX - r.left) / r.width) * WORLD_W;
      const wy = ((ev.clientY - r.top) / r.height) * WORLD_H;
      this.getScene()?.centerCamera(wx, wy);
    };
    this.minimap.addEventListener('mousedown', jump);
    this.minimap.addEventListener('mousemove', (ev) => {
      if (ev.buttons === 1) jump(ev);
    });

    const tabs = this.el('div', 'tabs', this.panelEl);
    const tabDefs: [BuildTab, string][] = [
      ['buildings', '建筑'],
      ['fortifications', '工事'],
      ['units', '单位'],
    ];
    for (const [group, label] of tabDefs) {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = `tab${group === 'buildings' ? ' active' : ''}`;
      button.onclick = () => this.switchTab(group);
      tabs.appendChild(button);
      this.tabButtons.set(group, button);
    }

    const grid = this.el('div', 'btn-grid', this.panelEl);
    for (const kind of BUILDING_KINDS) {
      const st = BUILDING_STATS[kind];
      const btn = this.makeButton(grid, `b-${kind}`, st.name, st.cost, st.desc, () =>
        this.getScene()?.uiAction(this.scene?.placement === kind ? 'cancelPlace' : 'place', kind),
      );
      btn.dataset.group = 'buildings';
    }
    for (const kind of FORTIFICATION_KINDS) {
      const st = BUILDING_STATS[kind];
      const btn = this.makeButton(grid, `b-${kind}`, st.name, st.cost, st.desc, () =>
        this.getScene()?.uiAction(this.scene?.placement === kind ? 'cancelPlace' : 'place', kind),
      );
      btn.dataset.group = 'fortifications';
      btn.style.display = 'none';
    }
    for (const kind of UNIT_KINDS) {
      const st = UNIT_STATS[kind];
      const btn = this.makeButton(grid, `u-${kind}`, st.name, st.cost, st.desc, () =>
        this.getScene()?.uiAction('enqueue', kind),
      );
      btn.dataset.group = 'units';
      btn.style.display = 'none';
    }
    this.el('div', 'queue-title', this.panelEl, '生产队列（点击取消）');
    this.queueEl = this.el('div', 'queue', this.panelEl);

    // 选中信息
    this.selEl = this.el('div', 'selinfo', root);

    // 帮助说明（开局自动显示）
    this.helpEl = this.el('div', 'help', root);
    this.helpEl.innerHTML = `
      <div class="help-box">
        <div class="help-title">赤色前线：黎明协议</div>
        <div class="help-goal">目标：摧毁地图对角的<b>敌方指挥中心</b>；保住自己的指挥中心。</div>
        <div class="help-cols">
          <div class="help-col">
            <div class="help-h">操作（Mac）</div>
            <ul>
              <li><kbd>点按</kbd> 选择 / 拖动框选</li>
              <li><kbd>⇧ Shift</kbd>+<kbd>点按</kbd> 追加选择</li>
              <li><kbd>双指轻点触控板</kbd> 或 <kbd>⌃ Ctrl</kbd>+<kbd>点按</kbd>：移动 / 点敌人攻击 / 点矿区开采</li>
              <li>选中兵营或工厂后同上操作：设置集结点</li>
              <li><kbd>双指滑动</kbd> 缩放地图</li>
              <li>雷达在线时点击地图 快速跳转视野</li>
            </ul>
          </div>
          <div class="help-col">
            <div class="help-h">快捷键</div>
            <ul>
              <li><kbd>F</kbd> 部署基地工程车</li>
              <li><kbd>Esc</kbd> 取消放置 / 取消选择</li>
              <li><kbd>←↑↓→</kbd> / <kbd>WASD</kbd> 卷动地图（鼠标贴边亦可）</li>
              <li><kbd>H</kbd> 打开 / 关闭本说明</li>
            </ul>
          </div>
          <div class="help-col">
            <div class="help-h">发展路线</div>
            <ul>
              <li>① 工程车按 <kbd>F</kbd> 部署为指挥中心</li>
              <li>② 建<b>发电站</b>供电并点亮雷达（缺电会关闭）</li>
              <li>③ 建<b>资源精炼厂</b>，附赠采矿车自动赚钱</li>
              <li>④ 指挥中心提供固定建造圈；远处扩张需再部署一辆<b>基地工程车</b></li>
              <li>⑤ 回“建筑”页，在绿色范围内建<b>兵营</b></li>
              <li>⑥ 兵营完工后打开“单位”页训练<b>步兵</b></li>
              <li>⑦ 精炼厂 → <b>战车工厂</b>解锁坦克，再建<b>维修工厂</b>自动修复附近作战单位</li>
              <li>⑧ 战车工厂还会解锁高耗电的<b>光棱塔</b>，蓄能后发射高伤害光束</li>
              <li>⑨ “工事”页可部署城墙、障碍、警戒灯与矿脉</li>
              <li>⑩ 攒一波装甲部队，端掉对面老家</li>
            </ul>
          </div>
        </div>
        <div class="diff-row">
          <span class="help-h" style="border:none;margin:0">难度</span>
          <button class="diff-btn" data-d="easy">简单</button>
          <button class="diff-btn active" data-d="normal">普通</button>
          <button class="diff-btn" data-d="hard">困难</button>
        </div>
        <button class="help-close">开始游戏（H）</button>
      </div>`;
    this.helpCloseBtn = this.helpEl.querySelector<HTMLButtonElement>('.help-close')!;
    this.helpCloseBtn.addEventListener('click', () => this.toggleHelp(false));
    for (const btn of this.helpEl.querySelectorAll<HTMLButtonElement>('.diff-btn')) {
      btn.onclick = () => {
        const d = btn.dataset.d as 'easy' | 'normal' | 'hard';
        this.getScene()?.setDifficulty(d);
        for (const b of this.helpEl.querySelectorAll('.diff-btn')) b.classList.toggle('active', b === btn);
      };
    }
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'h' || ev.key === 'H') this.toggleHelp(this.helpEl.style.display === 'none');
    });

    // 胜负遮罩
    this.overlayEl = this.el('div', 'overlay', root);
    this.overlayEl.style.display = 'none';
  }

  private toggleHelp(show: boolean): void {
    this.helpEl.style.display = show ? 'flex' : 'none';
    this.getScene()?.setPaused(show);
    if (!show && !this.hasStarted) {
      this.hasStarted = true;
      this.helpCloseBtn.textContent = '返回战场（H）';
    }
  }

  private makeButton(
    parent: HTMLElement,
    key: string,
    name: string,
    cost: number,
    desc: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    btn.innerHTML = `<span class="btn-name">${name}</span><span class="btn-cost">$${cost}</span>`;
    btn.title = desc;
    btn.onclick = onClick;
    parent.appendChild(btn);
    this.buttons.set(key, btn);
    return btn;
  }

  private switchTab(tab: BuildTab): void {
    this.tab = tab;
    for (const [group, button] of this.tabButtons) button.classList.toggle('active', tab === group);
    for (const [key, btn] of this.buttons) {
      const show = btn.dataset.group === tab;
      btn.style.display = show ? '' : 'none';
      void key;
    }
  }

  private refresh(): void {
    const scene = this.getScene();
    if (!scene) return;
    const snap = scene.hudSnapshot();

    // 顶部栏
    this.creditsEl.textContent = `💰 ${snap.credits}`;
    this.powerEl.textContent = `⚡ ${snap.powerUse}/${snap.powerGen}`;
    this.powerEl.classList.toggle('low', snap.lowPower);

    // 消息
    const msgs = scene.drainMessages();
    if (msgs.length > 0) {
      this.toastEl.textContent = msgs[msgs.length - 1];
      this.toastEl.classList.add('show');
      this.toastTimer = 28;
    } else if (this.toastTimer > 0) {
      this.toastTimer--;
      if (this.toastTimer === 0) this.toastEl.classList.remove('show');
    }

    this.refreshButtons(scene, snap);
    this.refreshQueue(scene, snap);
    this.refreshSelection(scene, snap);
    this.refreshRadar(scene, snap);
    this.refreshOverlay(snap);
  }

  private refreshButtons(scene: GameScene, snap: HudSnapshot): void {
    for (const kind of BUILDABLE_KINDS) {
      const btn = this.buttons.get(`b-${kind}`)!;
      const st = BUILDING_STATS[kind];
      const need = BUILD_PREREQ[kind];
      const prereqOk = !need || scene.prereqMet('player', kind);
      btn.disabled = snap.credits < st.cost || !prereqOk;
      btn.classList.toggle('placing', snap.placement === kind);
      btn.title = prereqOk ? st.desc : `${st.desc}（需要${need ? BUILDING_STATS[need].name : ''}）`;
    }
    for (const kind of UNIT_KINDS) {
      const btn = this.buttons.get(`u-${kind}`)!;
      const st = UNIT_STATS[kind];
      const ok = st.producer ? scene.hasProducer('player', st.producer) : false;
      btn.disabled = !ok || snap.credits < st.cost || snap.queue.length >= 5;
      btn.title = ok ? st.desc : `${st.desc}（需要${st.producer ? BUILDING_STATS[st.producer].name : ''}）`;
      // 缺生产建筑时，价格位置直接显示原因
      const costEl = btn.querySelector('.btn-cost');
      if (costEl) costEl.textContent = ok ? `$${st.cost}` : `需要${st.producer ? BUILDING_STATS[st.producer].name : ''}`;
    }

  }

  private refreshQueue(scene: GameScene, snap: HudSnapshot): void {
    this.queueEl.innerHTML = '';
    snap.queue.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'queue-item';
      const label = document.createElement('span');
      label.textContent = item.name;
      const bar = document.createElement('div');
      bar.className = 'queue-bar';
      const fill = document.createElement('div');
      fill.className = 'queue-fill';
      fill.style.width = `${Math.round(item.ratio * 100)}%`;
      bar.appendChild(fill);
      row.append(label, bar);
      row.onclick = () => scene.uiAction('cancelQueue', i);
      this.queueEl.appendChild(row);
    });
  }

  private refreshSelection(scene: GameScene, snap: HudSnapshot): void {
    this.selEl.innerHTML = '';
    if (snap.selected.length === 0) {
      this.selEl.style.display = 'none';
      return;
    }
    this.selEl.style.display = '';
    if (snap.selected.length === 1) {
      const s = snap.selected[0];
      const info = document.createElement('span');
      info.className = 'sel-name';
      info.textContent = `${s.name}  ${s.hp}/${s.maxHp}`;
      this.selEl.appendChild(info);
      if (s.isProducer) {
        const hint = document.createElement('span');
        hint.className = 'sel-hint';
        hint.textContent = '双指轻点 / ⌃+点按地图：设置集结点（新单位出厂后前往驻守）';
        this.selEl.appendChild(hint);
      }
    } else {
      const info = document.createElement('span');
      info.className = 'sel-name';
      info.textContent = `已选中 ${snap.selected.length} 个单位`;
      this.selEl.appendChild(info);
    }
    if (snap.canDeploy) {
      const btn = document.createElement('button');
      btn.className = 'deploy-btn';
      btn.textContent = '⛺ 部署 (F)';
      btn.onclick = () => scene.uiAction('deploy');
      this.selEl.appendChild(btn);
    }
  }

  private refreshRadar(scene: GameScene, snap: HudSnapshot): void {
    const powerReserve = snap.powerGen - snap.powerUse;
    const online = !snap.lowPower && powerReserve >= RADAR_POWER_REQUIRED;
    this.radarOnline = online;
    this.radarEl.classList.toggle('online', online);
    this.radarEl.classList.toggle('offline', !online);
    this.radarStatusEl.textContent = `${online ? '在线' : '离线'} · 余电 ${powerReserve}`;
    if (online) this.refreshMinimap(scene);
  }

  private refreshMinimap(scene: GameScene): void {
    const ctx = this.minimapCtx;
    const S = MINIMAP_SIZE;
    if (!this.terrainCache) {
      this.terrainCache = document.createElement('canvas');
      this.terrainCache.width = S;
      this.terrainCache.height = S;
    }
    if (this.terrainRevision !== scene.map.revision) {
      const tc = this.terrainCache.getContext('2d')!;
      tc.clearRect(0, 0, S, S);
      const map = scene.map;
      for (let ty = 0; ty < 64; ty++) {
        for (let tx = 0; tx < 64; tx++) {
          const t = map.tiles[ty * 64 + tx];
          tc.fillStyle = t === 2 ? '#2b2b33' : t === 1 ? '#a8842c' : '#3d4130';
          tc.fillRect((tx / 64) * S, (ty / 64) * S, S / 64 + 0.5, S / 64 + 0.5);
        }
      }
      this.terrainRevision = scene.map.revision;
    }
    ctx.drawImage(this.terrainCache, 0, 0);
    // 迷雾
    const fog = scene.fog.grid;
    for (let ty = 0; ty < 64; ty++) {
      for (let tx = 0; tx < 64; tx++) {
        const v = fog[ty * 64 + tx];
        if (v === 2) continue;
        ctx.fillStyle = v === 0 ? 'rgba(4,6,5,0.95)' : 'rgba(4,6,5,0.5)';
        ctx.fillRect((tx / 64) * S, (ty / 64) * S, S / 64 + 0.5, S / 64 + 0.5);
      }
    }
    const dot = (x: number, y: number, color: string, size: number) => {
      ctx.fillStyle = color;
      ctx.fillRect((x / WORLD_W) * S - size / 2, (y / WORLD_H) * S - size / 2, size, size);
    };
    for (const b of scene.buildings) {
      if (!b.alive) continue;
      if (b.faction === 'player') dot(b.x, b.y, '#e0503f', 4);
      else if (scene.fog.isExploredWorld(b.x, b.y)) dot(b.x, b.y, '#8a68e0', 4);
    }
    for (const u of scene.units) {
      if (!u.alive) continue;
      if (u.faction === 'player') dot(u.x, u.y, '#ff7a6a', 2);
      else if (scene.fog.isVisibleWorld(u.x, u.y)) dot(u.x, u.y, '#b39dff', 2);
    }
    // 视野框
    const cam = scene.cameras.main;
    const v = cam.worldView;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect((v.x / WORLD_W) * S, (v.y / WORLD_H) * S, (v.width / WORLD_W) * S, (v.height / WORLD_H) * S);
  }

  private refreshOverlay(snap: HudSnapshot): void {
    if (!snap.gameOver) return;
    if (this.overlayEl.style.display !== 'none') return;
    const win = snap.gameOver === 'victory';
    this.overlayEl.innerHTML = '';
    const box = document.createElement('div');
    box.className = `overlay-box ${win ? 'win' : 'lose'}`;
    const h = document.createElement('div');
    h.className = 'overlay-title';
    h.textContent = win ? '胜 利' : '战 败';
    const p = document.createElement('div');
    p.className = 'overlay-sub';
    p.textContent = win ? '敌方指挥中心已被摧毁，黎明协议达成。' : '指挥中心陷落，前线就此沉寂。';
    const btn = document.createElement('button');
    btn.className = 'overlay-btn';
    btn.textContent = '再来一局';
    btn.onclick = () => window.location.reload();
    box.append(h, p, btn);
    this.overlayEl.appendChild(box);
    this.overlayEl.style.display = 'flex';
  }
}
