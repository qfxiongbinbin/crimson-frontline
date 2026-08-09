import {
  BUILD_PREREQ,
  BUILD_RADIUS,
  BUILDING_STATS,
  DIFFICULTY,
  ENEMY_START_CREDITS,
  MAX_QUEUE,
  ORE_PER_TILE,
  START_CREDITS,
  TILE,
  UNIT_STATS,
  WORLD_H,
  WORLD_W,
  type BuildingKind,
  type Difficulty,
  type Faction,
  type UnitKind,
} from '../config';
import type { HudSnapshot, QueueItem } from '../types';
import { BaseEntity } from '../entities/BaseEntity';
import { Building } from '../entities/Building';
import { Unit } from '../entities/Unit';
import { ENEMY_HOME, GameMap, PLAYER_HOME, T_ORE } from '../world/GameMap';
import { FogOfWar } from '../world/FogOfWar';
import { EnemyAI } from '../systems/EnemyAI';
import { explosion, floatText, rallyFlag, tracer } from '../systems/Effects';
import { initSfx, sfx } from '../core/Sfx';

interface DragState {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
}

export class GameScene extends Phaser.Scene {
  map!: GameMap;
  fog!: FogOfWar;
  ai!: EnemyAI;

  units: Unit[] = [];
  buildings: Building[] = [];
  selected: BaseEntity[] = [];

  credits: Record<Faction, number> = { player: START_CREDITS, enemy: ENEMY_START_CREDITS };
  unitQueues: Record<Faction, QueueItem[]> = { player: [], enemy: [] };

  placement: BuildingKind | null = null;
  gameOver: 'victory' | 'defeat' | null = null;
  messages: string[] = [];
  difficulty: Difficulty = 'normal';
  /** 开局说明和帮助面板显示时冻结战局。 */
  paused = true;

  private drag: DragState | null = null;
  private dragGfx!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private fogTimer = 0;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create(): void {
    this.map = new GameMap(this);
    this.fog = new FogOfWar(this);
    this.ai = new EnemyAI(this);

    this.dragGfx = this.add.graphics().setDepth(950);
    this.ghost = this.add.graphics().setDepth(940);

    // 玩家：一辆基地工程车开局
    this.spawnUnit('mcv', 'player', (PLAYER_HOME.tx + 1.5) * TILE, (PLAYER_HOME.ty + 1.5) * TILE);

    // 敌方：预建基地（指挥中心 + 电站 + 精炼厂，精炼厂附赠采矿车）
    this.placeBuilding('constructionYard', 'enemy', ENEMY_HOME.tx, ENEMY_HOME.ty, true);
    this.placeBuilding('powerPlant', 'enemy', ENEMY_HOME.tx - 4, ENEMY_HOME.ty + 2, true);
    const ref = this.placeBuilding('refinery', 'enemy', ENEMY_HOME.tx + 1, ENEMY_HOME.ty + 5, true);
    if (ref) this.spawnUnitNear(ref, 'harvester', 'enemy');

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.centerOn((PLAYER_HOME.tx + 2) * TILE, (PLAYER_HOME.ty + 2) * TILE);

    this.setupInput();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ESC') as Record<string, Phaser.Input.Keyboard.Key>;

    // 调试钩子（自动化冒烟测试用）
    (window as unknown as { __game: GameScene }).__game = this;
  }

  // ---------------- 输入 ----------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.setTopOnly(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      initSfx();
      if (this.gameOver) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (p.button === 0) {
        if (this.placement) {
          this.confirmPlacement(w.x, w.y);
          return;
        }
        this.drag = { sx: p.x, sy: p.y, wx: w.x, wy: w.y };
      } else if (p.button === 2) {
        if (this.placement) {
          this.cancelPlacement();
          return;
        }
        this.issueCommand(w.x, w.y);
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.dragGfx.clear();
      if (Math.hypot(p.x - this.drag.sx, p.y - this.drag.sy) > 8) {
        this.dragGfx.lineStyle(1.5, 0x86ff7a, 0.9);
        this.dragGfx.fillStyle(0x86ff7a, 0.12);
        const x = Math.min(this.drag.wx, w.x);
        const y = Math.min(this.drag.wy, w.y);
        const rw = Math.abs(w.x - this.drag.wx);
        const rh = Math.abs(w.y - this.drag.wy);
        this.dragGfx.fillRect(x, y, rw, rh);
        this.dragGfx.strokeRect(x, y, rw, rh);
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      this.dragGfx.clear();
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const shift = (p.event as PointerEvent).shiftKey;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) <= 8) {
        this.clickSelect(w.x, w.y, shift);
      } else {
        this.boxSelect(d.wx, d.wy, w.x, w.y, shift);
      }
    });

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.6));
    });

    this.input.keyboard!.on('keydown-F', () => this.deployMCV());
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.placement) this.cancelPlacement();
      else this.clearSelection();
    });
  }

  // ---------------- 选择 ----------------

  clearSelection(): void {
    for (const e of this.selected) e.setSelected(false);
    this.selected = [];
  }

  private setSelection(list: BaseEntity[], additive: boolean): void {
    if (!additive) this.clearSelection();
    for (const e of list) {
      if (!this.selected.includes(e)) {
        this.selected.push(e);
        e.setSelected(true);
      }
    }
    if (list.length > 0) sfx.click();
  }

  private clickSelect(x: number, y: number, shift: boolean): void {
    let best: Unit | null = null;
    let bestD = 26;
    for (const u of this.units) {
      if (u.faction !== 'player' || !u.alive) continue;
      const d = Phaser.Math.Distance.Between(x, y, u.x, u.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best) {
      this.setSelection([best], shift);
      return;
    }
    const b = this.buildings.find((b) => b.faction === 'player' && b.alive && b.containsPoint(x, y));
    if (b) {
      this.setSelection([b], shift);
      return;
    }
    if (!shift) this.clearSelection();
  }

  private boxSelect(x1: number, y1: number, x2: number, y2: number, shift: boolean): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const hit = this.units.filter(
      (u) => u.faction === 'player' && u.alive && u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY,
    );
    if (hit.length === 0 && !shift) {
      this.clearSelection();
      return;
    }
    this.setSelection(hit, shift);
  }

  // ---------------- 命令 ----------------

  private issueCommand(x: number, y: number): void {
    if (this.selected.length === 0) return;

    // 单个生产建筑被选中 → 设置集结点
    if (this.selected.length === 1) {
      const e = this.selected[0];
      if (e instanceof Building && e.isProducer && e.active) {
        e.setRally(x, y);
        rallyFlag(this, x, y);
        this.pushMessage(`集结点已设置：${e.displayName}，新单位出厂后前往驻守`);
        return;
      }
    }

    // 命中可见敌人 → 攻击
    const target = this.enemyAt(x, y);
    const units = this.selected.filter((e): e is Unit => e instanceof Unit && e.alive);
    if (target) {
      for (const u of units) {
        if (u.canAttack) u.orderAttack(target);
        else u.orderMove(target.x, target.y);
      }
      if (units.length > 0) sfx.click();
      return;
    }

    // 点击矿格且选中有采矿车 → 指定采矿
    if (this.map.tileAt(x, y) === T_ORE) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      let any = false;
      for (const u of units) {
        if (u.kind === 'harvester') {
          u.orderHarvest({ tx, ty });
          any = true;
        }
      }
      if (any) {
        sfx.click();
        return;
      }
    }

    // 普通移动（简单方阵散开）
    let i = 0;
    for (const u of units) {
      const ox = ((i % 3) - 1) * 30;
      const oy = (Math.floor(i / 3) % 3) * 30 - 30;
      u.orderMove(
        Phaser.Math.Clamp(x + ox, 16, WORLD_W - 16),
        Phaser.Math.Clamp(y + oy, 16, WORLD_H - 16),
      );
      i++;
    }
    if (units.length > 0) sfx.click();
  }

  private enemyAt(x: number, y: number): BaseEntity | null {
    if (!this.fog.isExploredWorld(x, y)) return null;
    for (const u of this.units) {
      if (u.faction !== 'enemy' || !u.alive) continue;
      if (Phaser.Math.Distance.Between(x, y, u.x, u.y) < 22 && this.fog.isVisibleWorld(u.x, u.y)) return u;
    }
    for (const b of this.buildings) {
      if (b.faction !== 'enemy' || !b.alive) continue;
      if (b.containsPoint(x, y)) return b;
    }
    return null;
  }

  // ---------------- 建造 ----------------

  requestPlacement(kind: BuildingKind): void {
    const stats = BUILDING_STATS[kind];
    if (this.credits.player < stats.cost) {
      this.pushMessage('资金不足');
      sfx.error();
      return;
    }
    if (!this.prereqMet('player', kind)) {
      this.pushMessage(`需要先有${BUILDING_STATS[BUILD_PREREQ[kind]!].name}`);
      sfx.error();
      return;
    }
    this.placement = kind;
    sfx.click();
  }

  cancelPlacement(): void {
    this.placement = null;
    this.ghost.clear();
  }

  private confirmPlacement(x: number, y: number): void {
    if (!this.placement) return;
    const kind = this.placement;
    const [wt, ht] = BUILDING_STATS[kind].size;
    const tx = Math.floor(x / TILE - wt / 2 + 0.5);
    const ty = Math.floor(y / TILE - ht / 2 + 0.5);
    if (!this.canPlace(kind, tx, ty, 'player')) {
      this.pushMessage('无法在此建造：超出范围或地形被占用');
      sfx.error();
      return;
    }
    const stats = BUILDING_STATS[kind];
    this.credits.player -= stats.cost;
    if (stats.terrainEffect) {
      this.placeTerrainProject(kind, tx, ty);
      this.pushMessage(`部署完成：${stats.name}`);
      sfx.ready();
    } else {
      this.placeBuilding(kind, 'player', tx, ty);
      this.pushMessage(`开始建造：${stats.name}`);
    }
    this.placement = null;
    this.ghost.clear();
  }

  placeTerrainProject(kind: BuildingKind, tx: number, ty: number): boolean {
    const stats = BUILDING_STATS[kind];
    const [wt, ht] = stats.size;
    if (stats.terrainEffect === 'ground') {
      this.map.placeGroundPatch(tx, ty, wt, ht);
      return true;
    }
    if (stats.terrainEffect === 'ore') {
      this.map.placeOreDeposit(tx, ty, wt, ht, stats.orePerTile ?? ORE_PER_TILE);
      return true;
    }
    return false;
  }

  canPlace(kind: BuildingKind, tx: number, ty: number, faction: Faction): boolean {
    const [wt, ht] = BUILDING_STATS[kind].size;
    if (tx < 1 || ty < 1 || tx + wt >= 63 || ty + ht >= 63) return false;
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const overlaps = tx < b.tx + b.wt && tx + wt > b.tx && ty < b.ty + b.ht && ty + ht > b.ty;
      if (overlaps) return false;
    }
    for (let y = ty; y < ty + ht; y++) {
      for (let x = tx; x < tx + wt; x++) {
        if (!this.map.isWalkable(x, y)) return false;
        if (this.map.oreAt(x, y) > 0) return false;
      }
    }
    // 建造范围：与任意己方建筑的距离不超过 BUILD_RADIUS
    for (const b of this.buildings) {
      if (b.faction !== faction || !b.alive) continue;
      if (b.stats.canAnchorBuild === false) continue;
      const dx = Math.max(b.tx - (tx + wt), tx - (b.tx + b.wt), 0);
      const dy = Math.max(b.ty - (ty + ht), ty - (b.ty + b.ht), 0);
      if (Math.hypot(dx, dy) <= BUILD_RADIUS) return true;
    }
    return false;
  }

  placeBuilding(kind: BuildingKind, faction: Faction, tx: number, ty: number, instant = false): Building | null {
    if (BUILDING_STATS[kind].terrainEffect) return null;
    const b = new Building(this, kind, faction, tx, ty, instant);
    this.buildings.push(b);
    if (b.stats.blocksMovement !== false) this.map.blockFootprint(tx, ty, b.wt, b.ht, true);
    return b;
  }

  /** AI 找位置并建造 */
  aiPlaceBuilding(kind: BuildingKind): boolean {
    const [wt, ht] = BUILDING_STATS[kind].size;
    const own = this.buildings.filter((b) => b.faction === 'enemy' && b.alive);
    for (let attempt = 0; attempt < 90; attempt++) {
      const anchor = own[Math.floor(Math.random() * own.length)];
      if (!anchor) return false;
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.floor(Math.random() * 5);
      const tx = Math.round(anchor.tx + anchor.wt / 2 + Math.cos(ang) * dist - wt / 2);
      const ty = Math.round(anchor.ty + anchor.ht / 2 + Math.sin(ang) * dist - ht / 2);
      if (this.canPlace(kind, tx, ty, 'enemy')) {
        this.credits.enemy -= BUILDING_STATS[kind].cost;
        this.placeBuilding(kind, 'enemy', tx, ty);
        return true;
      }
    }
    return false;
  }

  onBuildingComplete(b: Building): void {
    if (b.faction === 'player') {
      this.pushMessage(`${b.displayName} 建造完成`);
      sfx.ready();
    }
    if (b.kind === 'refinery') {
      this.spawnUnitNear(b, 'harvester', b.faction);
      if (b.faction === 'player') this.pushMessage('精炼厂附赠一辆采矿车');
    }
  }

  prereqMet(faction: Faction, kind: BuildingKind): boolean {
    const need = BUILD_PREREQ[kind];
    if (!need) return true;
    return this.buildings.some((b) => b.faction === faction && b.alive && b.active && b.kind === need);
  }

  // ---------------- 生产 ----------------

  hasProducer(faction: Faction, producer: BuildingKind): boolean {
    return this.buildings.some((b) => b.faction === faction && b.alive && b.active && b.kind === producer);
  }

  enqueueUnit(faction: Faction, kind: UnitKind): boolean {
    const stats = UNIT_STATS[kind];
    const q = this.unitQueues[faction];
    if (q.length >= MAX_QUEUE) {
      if (faction === 'player') {
        this.pushMessage('生产队列已满');
        sfx.error();
      }
      return false;
    }
    if (!stats.producer || !this.hasProducer(faction, stats.producer)) {
      if (faction === 'player') {
        this.pushMessage(`需要${stats.producer ? BUILDING_STATS[stats.producer].name : ''}`);
        sfx.error();
      }
      return false;
    }
    if (this.credits[faction] < stats.cost) {
      if (faction === 'player') {
        this.pushMessage('资金不足');
        sfx.error();
      }
      return false;
    }
    this.credits[faction] -= stats.cost;
    q.push({ kind, progress: 0 });
    if (faction === 'player') sfx.click();
    return true;
  }

  cancelQueued(faction: Faction, index: number): void {
    const q = this.unitQueues[faction];
    const item = q[index];
    if (!item) return;
    const stats = UNIT_STATS[item.kind];
    const refund = Math.round(stats.cost * (1 - item.progress / stats.buildTime));
    this.credits[faction] += refund;
    q.splice(index, 1);
  }

  private updateProduction(dt: number): void {
    for (const faction of ['player', 'enemy'] as Faction[]) {
      const q = this.unitQueues[faction];
      const item = q[0];
      if (!item) continue;
      const stats = UNIT_STATS[item.kind];
      if (!stats.producer || !this.hasProducer(faction, stats.producer)) continue;
      const speed = this.powerOk(faction) ? 1 : 0.5;
      item.progress += dt * speed;
      if (item.progress >= stats.buildTime) {
        q.shift();
        const producer = this.buildings.find(
          (b) => b.faction === faction && b.alive && b.active && b.kind === stats.producer,
        );
        if (producer) {
          const u = this.spawnUnitNear(producer, item.kind, faction);
          if (u && producer.rally) u.orderMove(producer.rally.x, producer.rally.y);
        }
        if (faction === 'player') {
          this.pushMessage(`单位就绪：${stats.name}`);
          sfx.ready();
        }
      }
    }
  }

  spawnUnitNear(b: Building, kind: UnitKind, faction: Faction): Unit | null {
    for (let r = 0; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = b.tx + Math.floor(b.wt / 2) + dx;
          const ty = b.ty + b.ht + 1 + dy; // 优先从下方出厂
          if (this.map.isWalkable(tx, ty)) {
            return this.spawnUnit(kind, faction, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
          }
        }
      }
    }
    return null;
  }

  spawnUnit(kind: UnitKind, faction: Faction, x: number, y: number): Unit {
    const u = new Unit(this, kind, faction, x, y);
    this.units.push(u);
    return u;
  }

  // ---------------- 经济 / 电力 ----------------

  powerGen(faction: Faction): number {
    return this.buildings
      .filter((b) => b.faction === faction && b.alive && b.active && b.stats.power > 0)
      .reduce((s, b) => s + b.stats.power, 0);
  }

  powerUse(faction: Faction): number {
    return this.buildings
      .filter((b) => b.faction === faction && b.alive && b.active && b.stats.power < 0)
      .reduce((s, b) => s - b.stats.power, 0);
  }

  powerOk(faction: Faction): boolean {
    return this.powerGen(faction) >= this.powerUse(faction);
  }

  deposit(faction: Faction, amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    this.credits[faction] += amount;
    if (faction === 'player') {
      floatText(this, x, y, `+${amount}`);
      sfx.cash();
    }
  }

  findRefinery(faction: Faction, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.faction !== faction || !b.alive || !b.active || b.kind !== 'refinery') continue;
      const d = Phaser.Math.Distance.Between(x, y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // ---------------- 战斗 ----------------

  findEnemyInRange(self: BaseEntity, rangePx: number): BaseEntity | null {
    const foe: Faction = self.faction === 'player' ? 'enemy' : 'player';
    let best: BaseEntity | null = null;
    let bestD = rangePx;
    const consider = (e: BaseEntity, d: number) => {
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    };
    for (const u of this.units) {
      if (u.faction !== foe || !u.alive) continue;
      const d = Phaser.Math.Distance.Between(self.x, self.y, u.x, u.y);
      if (d <= rangePx) consider(u, d);
    }
    for (const b of this.buildings) {
      if (b.faction !== foe || !b.alive) continue;
      const d = Phaser.Math.Distance.Between(self.x, self.y, b.x, b.y) - (b.wt * TILE) / 2;
      if (d <= rangePx) consider(b, Math.max(0, d));
    }
    return best;
  }

  fireWeapon(attacker: BaseEntity, target: BaseEntity, damage: number): void {
    const color = attacker.faction === 'player' ? 0xffd27a : 0xc3b2ff;
    tracer(this, attacker.x, attacker.y - 6, target.x, target.y, color);
    target.takeDamage(damage);
    // 只有玩家视野内的交火才播音效，避免远处噪音
    if (attacker.faction === 'player' || this.fog.isVisibleWorld(attacker.x, attacker.y)) sfx.shoot();
  }

  onEntityDied(e: BaseEntity): void {
    const big = e instanceof Building && !e.stats.textureKey;
    explosion(this, e.x, e.y, big);
    if (this.fog.isVisibleWorld(e.x, e.y) || e.faction === 'player') sfx.boom(big);
    if (e instanceof Building) {
      if (e.stats.blocksMovement !== false) this.map.blockFootprint(e.tx, e.ty, e.wt, e.ht, false);
    }
    if (this.selected.includes(e)) {
      this.selected = this.selected.filter((s) => s !== e);
    }
    if (e.faction === 'player') this.pushMessage(`我方失去：${e.displayName}`);
    else if (this.fog.isVisibleWorld(e.x, e.y)) this.pushMessage(`摧毁敌方${e.displayName}`);

    if (e instanceof Building && e.kind === 'constructionYard') {
      this.endGame(e.faction === 'enemy' ? 'victory' : 'defeat');
    }
  }

  playerPrimaryTarget(): { x: number; y: number } | null {
    const cy = this.buildings.find((b) => b.faction === 'player' && b.alive && b.kind === 'constructionYard');
    if (cy) return { x: cy.x, y: cy.y };
    const u = this.units.find((u) => u.faction === 'player' && u.alive);
    if (u) return { x: u.x, y: u.y };
    const b = this.buildings.find((b) => b.faction === 'player' && b.alive);
    return b ? { x: b.x, y: b.y } : null;
  }

  private endGame(result: 'victory' | 'defeat'): void {
    if (this.gameOver) return;
    this.gameOver = result;
    this.pushMessage(result === 'victory' ? '敌方指挥中心已被摧毁！' : '指挥中心陷落……');
  }

  // ---------------- 工程车部署 ----------------

  deployMCV(): void {
    if (this.gameOver) return;
    const mcv = this.selected.find(
      (e): e is Unit => e instanceof Unit && e.alive && e.kind === 'mcv' && e.faction === 'player',
    );
    if (!mcv) return;
    const [wt, ht] = BUILDING_STATS.constructionYard.size;
    const tx = Math.floor(mcv.x / TILE - wt / 2);
    const ty = Math.floor(mcv.y / TILE - ht / 2);
    for (let y = ty; y < ty + ht; y++) {
      for (let x = tx; x < tx + wt; x++) {
        if (!this.map.isWalkable(x, y)) {
          this.pushMessage('此处地形无法部署指挥中心');
          sfx.error();
          return;
        }
      }
    }
    mcv.alive = false;
    mcv.destroy();
    this.units = this.units.filter((u) => u !== mcv);
    this.clearSelection();
    const cy = this.placeBuilding('constructionYard', 'player', tx, ty, true);
    if (cy) {
      this.pushMessage('指挥中心部署完成，开始建设基地');
      sfx.ready();
      this.setSelection([cy], false);
    }
  }

  // ---------------- 主循环 ----------------

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);

    if (!this.gameOver && !this.paused) {
      for (const u of this.units.slice()) if (u.alive) u.update(dt);
      for (const b of this.buildings.slice()) if (b.alive) b.update(dt);
      // 本帧阵亡的实体先从列表剔除，避免后续流程触碰已 destroy 的对象
      this.units = this.units.filter((u) => u.alive);
      this.buildings = this.buildings.filter((b) => b.alive);
      this.separateUnits();
      this.updateProduction(dt);
      this.ai.update(dt);
    }

    this.units = this.units.filter((u) => u.alive);
    this.buildings = this.buildings.filter((b) => b.alive);

    this.fogTimer -= dt;
    if (this.fogTimer <= 0) {
      this.fogTimer = 0.25;
      this.fog.recompute([...this.units, ...this.buildings]);
      this.updateVisibility();
    }

    if (!this.paused) {
      this.updateCamera(dt);
      this.updateGhost();
    }
  }

  private separateUnits(): void {
    const list = this.units;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a.alive || !b.alive) continue;
        if (Math.abs(a.x - b.x) > 24 || Math.abs(a.y - b.y) > 24) continue;
        a.pushFrom(b);
        b.pushFrom(a);
      }
    }
  }

  private updateVisibility(): void {
    for (const u of this.units) {
      if (u.faction === 'enemy') u.setVisible(this.fog.isVisibleWorld(u.x, u.y));
    }
    for (const b of this.buildings) {
      if (b.faction === 'enemy') b.setVisible(this.fog.isExploredWorld(b.x, b.y));
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const speed = 620 * dt / cam.zoom;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;
    // 边缘滚动（避开右侧 UI 面板区域）
    const p = this.input.activePointer;
    const w = this.scale.width;
    const h = this.scale.height;
    if (p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h && p.x < w - 218) {
      if (p.x < 18) dx -= 1;
      if (p.x > w - 18 && p.x < w - 218) dx += 1;
    }
    if (p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h) {
      if (p.y < 18) dy -= 1;
      if (p.y > h - 18) dy += 1;
    }
    cam.scrollX += dx * speed;
    cam.scrollY += dy * speed;
  }

  private updateGhost(): void {
    if (!this.placement) return;
    const p = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const [wt, ht] = BUILDING_STATS[this.placement].size;
    const tx = Math.floor(w.x / TILE - wt / 2 + 0.5);
    const ty = Math.floor(w.y / TILE - ht / 2 + 0.5);
    const ok = this.canPlace(this.placement, tx, ty, 'player');
    this.ghost.clear();
    this.ghost.fillStyle(ok ? 0x3aff6e : 0xff4444, 0.35);
    this.ghost.fillRect(tx * TILE, ty * TILE, wt * TILE, ht * TILE);
    this.ghost.lineStyle(2, ok ? 0x3aff6e : 0xff4444, 0.9);
    this.ghost.strokeRect(tx * TILE, ty * TILE, wt * TILE, ht * TILE);
  }

  // ---------------- HUD 接口 ----------------

  pushMessage(msg: string): void {
    this.messages.push(msg);
    if (this.messages.length > 8) this.messages.shift();
  }

  /** 切换难度：立即影响 AI 决策频率 / 波次规模，并按差额调整 AI 资金 */
  setDifficulty(d: Difficulty): void {
    if (d === this.difficulty) return;
    const prev = DIFFICULTY[this.difficulty];
    const next = DIFFICULTY[d];
    this.difficulty = d;
    this.credits.enemy = Math.max(0, this.credits.enemy + (next.enemyCredits - prev.enemyCredits));
    this.pushMessage(`难度已调整为：${next.name}`);
  }

  setPaused(paused: boolean): void {
    if (this.gameOver) return;
    this.paused = paused;
  }

  drainMessages(): string[] {
    const m = this.messages.slice();
    this.messages = [];
    return m;
  }

  hudSnapshot(): HudSnapshot {
    const q = this.unitQueues.player;
    return {
      credits: Math.floor(this.credits.player),
      powerGen: this.powerGen('player'),
      powerUse: this.powerUse('player'),
      lowPower: !this.powerOk('player'),
      queue: q.map((item, i) => ({
        kind: item.kind,
        name: UNIT_STATS[item.kind].name,
        ratio: i === 0 ? Math.min(1, item.progress / UNIT_STATS[item.kind].buildTime) : 0,
      })),
      selected: this.selected
        .filter((e) => e.alive)
        .map((e) => ({
          id: e.id,
          faction: e.faction,
          kind: e instanceof Unit ? e.kind : (e as Building).kind,
          name: e.displayName,
          isBuilding: e.isBuilding,
          isProducer: e instanceof Building && e.isProducer && e.active,
          hp: Math.ceil(e.hp),
          maxHp: e.maxHp,
          x: e.x,
          y: e.y,
        })),
      placement: this.placement,
      canDeploy: this.selected.some((e) => e instanceof Unit && e.alive && e.kind === 'mcv'),
      gameOver: this.gameOver,
    };
  }

  uiAction(action: string, payload?: string | number): void {
    switch (action) {
      case 'place':
        this.requestPlacement(payload as BuildingKind);
        break;
      case 'cancelPlace':
        this.cancelPlacement();
        break;
      case 'enqueue':
        this.enqueueUnit('player', payload as UnitKind);
        break;
      case 'cancelQueue':
        this.cancelQueued('player', payload as number);
        break;
      case 'deploy':
        this.deployMCV();
        break;
    }
  }

  centerCamera(x: number, y: number): void {
    this.cameras.main.centerOn(x, y);
  }

  // ---------------- 调试钩子（冒烟测试用） ----------------

  debugState(): Record<string, unknown> {
    return {
      credits: { ...this.credits },
      gameOver: this.gameOver,
      paused: this.paused,
      units: this.units.map((u) => ({
        faction: u.faction,
        kind: u.kind,
        x: Math.round(u.x),
        y: Math.round(u.y),
        hp: Math.round(u.hp),
        load: Math.round(u.load),
        hState: u.hState,
        visible: u.visible,
      })),
      buildings: this.buildings.map((b) => ({
        faction: b.faction,
        kind: b.kind,
        active: b.active,
        hp: Math.round(b.hp),
        tx: b.tx,
        ty: b.ty,
        x: Math.round(b.x),
        y: Math.round(b.y),
      })),
      power: { gen: this.powerGen('player'), use: this.powerUse('player') },
      selected: this.selected.length,
      queue: this.unitQueues.player.map((i) => i.kind),
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return { x: (x - cam.scrollX) * cam.zoom, y: (y - cam.scrollY) * cam.zoom };
  }
}
