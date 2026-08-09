import { BUILDING_STATS, FACTION_COLORS, TILE, UNIT_STATS, type BuildingKind, type Faction, type UnitKind } from '../config';
import { GENERATED_TEXTURES } from '../assets/generated/manifest';

type G = Phaser.GameObjects.Graphics;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function radialTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

// ---------- 单位贴图（统一朝上绘制，运行时旋转） ----------

function drawInfantry(g: G, s: number, c: (typeof FACTION_COLORS)[Faction], rocket: boolean): void {
  const cx = s / 2;
  const cy = s / 2;
  g.fillStyle(c.dark, 1);
  g.fillCircle(cx, cy, 7);
  g.fillStyle(c.main, 1);
  g.fillCircle(cx, cy, 5.5);
  g.fillStyle(0x2b2b30, 1);
  g.fillCircle(cx, cy - 1, 2.6); // 头盔
  if (rocket) {
    g.fillStyle(0x3a3a42, 1);
    g.fillRect(cx + 2, cy - 8, 3.5, 11); // 火箭筒
    g.fillStyle(c.accent, 1);
    g.fillRect(cx + 2, cy - 8, 3.5, 2.5);
  } else {
    g.lineStyle(2, 0x3a3a42, 1);
    g.lineBetween(cx + 3, cy + 3, cx + 7, cy - 5); // 步枪
  }
}

function drawTank(g: G, s: number, c: (typeof FACTION_COLORS)[Faction], heavy: boolean): void {
  const cx = s / 2;
  const cy = s / 2;
  const bw = heavy ? s * 0.62 : s * 0.56;
  const bh = heavy ? s * 0.78 : s * 0.72;
  // 履带
  g.fillStyle(0x26262c, 1);
  g.fillRect(cx - bw / 2 - 4, cy - bh / 2, 5, bh);
  g.fillRect(cx + bw / 2 - 1, cy - bh / 2, 5, bh);
  // 车体
  g.fillStyle(c.dark, 1);
  g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  g.fillStyle(c.main, 1);
  g.fillRect(cx - bw / 2 + 2, cy - bh / 2 + 2, bw - 4, bh - 4);
  // 炮塔
  g.fillStyle(c.light, 1);
  g.fillCircle(cx, cy, heavy ? 8 : 6.5);
  g.fillStyle(c.dark, 1);
  g.fillCircle(cx, cy, heavy ? 5 : 4);
  // 炮管（朝上）
  g.fillStyle(0x33333a, 1);
  if (heavy) {
    g.fillRect(cx - 5, cy - s * 0.46, 3, s * 0.4);
    g.fillRect(cx + 2, cy - s * 0.46, 3, s * 0.4);
  } else {
    g.fillRect(cx - 1.5, cy - s * 0.44, 3, s * 0.38);
  }
  g.fillStyle(c.accent, 1);
  g.fillRect(cx - bw / 2 + 2, cy + bh / 2 - 5, bw - 4, 2.5); // 尾部识别条
}

function drawHarvester(g: G, s: number, c: (typeof FACTION_COLORS)[Faction]): void {
  const cx = s / 2;
  const cy = s / 2;
  const bw = s * 0.66;
  const bh = s * 0.8;
  g.fillStyle(0x26262c, 1);
  g.fillRect(cx - bw / 2 - 4, cy - bh / 2, 5, bh);
  g.fillRect(cx + bw / 2 - 1, cy - bh / 2, 5, bh);
  g.fillStyle(c.dark, 1);
  g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  g.fillStyle(c.main, 1);
  g.fillRect(cx - bw / 2 + 2, cy - bh / 2 + 2, bw - 4, bh - 4);
  // 矿斗（琥珀条纹）
  g.fillStyle(0x8a6f2c, 1);
  g.fillRect(cx - bw / 2 + 4, cy + 2, bw - 8, bh / 2 - 6);
  g.fillStyle(0xd8a832, 1);
  for (let i = 0; i < 3; i++) g.fillRect(cx - bw / 2 + 6 + i * 7, cy + 4, 3, bh / 2 - 10);
  // 前铲
  g.fillStyle(c.light, 1);
  g.fillTriangle(cx - bw / 2, cy - bh / 2 - 2, cx + bw / 2, cy - bh / 2 - 2, cx, cy - bh / 2 + 6);
}

function drawMcv(g: G, s: number, c: (typeof FACTION_COLORS)[Faction]): void {
  const cx = s / 2;
  const cy = s / 2;
  const bw = s * 0.7;
  const bh = s * 0.84;
  g.fillStyle(0x26262c, 1);
  g.fillRect(cx - bw / 2 - 4, cy - bh / 2, 5, bh);
  g.fillRect(cx + bw / 2 - 1, cy - bh / 2, 5, bh);
  g.fillStyle(c.dark, 1);
  g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  g.fillStyle(c.main, 1);
  g.fillRect(cx - bw / 2 + 2, cy - bh / 2 + 2, bw - 4, bh - 4);
  // 工程舱
  g.fillStyle(c.light, 1);
  g.fillRect(cx - bw / 2 + 5, cy - bh / 2 + 5, bw - 10, bh * 0.4);
  // 折叠吊臂
  g.lineStyle(3, 0x3a3a42, 1);
  g.lineBetween(cx - bw / 2 + 6, cy + bh / 2 - 6, cx, cy);
  g.lineBetween(cx, cy, cx + bw / 2 - 6, cy + bh / 2 - 10);
  g.fillStyle(c.accent, 1);
  g.fillRect(cx - bw / 2 + 2, cy + bh / 2 - 5, bw - 4, 2.5);
}

// ---------- 建筑贴图 ----------

function buildingBase(g: G, w: number, h: number, c: (typeof FACTION_COLORS)[Faction]): void {
  g.fillStyle(0x1e1e24, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(c.dark, 1);
  g.fillRect(2, 2, w - 4, h - 4);
  g.fillStyle(c.main, 1);
  g.fillRect(4, 4, w - 8, h - 8);
}

function drawBuilding(g: G, kind: BuildingKind, c: (typeof FACTION_COLORS)[Faction]): void {
  const [wt, ht] = BUILDING_STATS[kind].size;
  const w = wt * TILE;
  const h = ht * TILE;
  buildingBase(g, w, h, c);
  switch (kind) {
    case 'constructionYard': {
      g.fillStyle(c.dark, 1);
      g.fillRect(w * 0.22, h * 0.22, w * 0.56, h * 0.56); // 内院
      g.fillStyle(c.light, 1);
      g.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
      g.fillStyle(c.dark, 1);
      for (const [px, py] of [
        [6, 6],
        [w - 16, 6],
        [6, h - 16],
        [w - 16, h - 16],
      ]) g.fillRect(px, py, 10, 10); // 角楼
      g.lineStyle(2, c.accent, 1);
      g.lineBetween(w / 2, h * 0.3, w / 2, 8); // 天线
      g.fillStyle(c.accent, 1);
      g.fillCircle(w / 2, 7, 2.5);
      break;
    }
    case 'powerPlant': {
      g.fillStyle(0x3a3a42, 1);
      g.fillRect(w * 0.18, h * 0.16, w * 0.2, h * 0.56); // 双烟囱
      g.fillRect(w * 0.62, h * 0.16, w * 0.2, h * 0.56);
      g.fillStyle(c.accent, 1);
      g.fillRect(w * 0.18, h * 0.16, w * 0.2, 5);
      g.fillRect(w * 0.62, h * 0.16, w * 0.2, 5);
      g.fillStyle(c.light, 1);
      g.fillRect(w * 0.2, h * 0.78, w * 0.6, 6); // 能量条
      break;
    }
    case 'refinery': {
      g.fillStyle(0x3a3a42, 1);
      g.fillRect(w * 0.08, h * 0.15, w * 0.4, h * 0.7); // 处理仓
      g.fillStyle(c.light, 1);
      g.fillCircle(w * 0.72, h * 0.5, h * 0.3); // 储矿罐
      g.fillStyle(c.dark, 1);
      g.fillCircle(w * 0.72, h * 0.5, h * 0.2);
      g.fillStyle(0xd8a832, 1);
      g.fillCircle(w * 0.72, h * 0.5, h * 0.1);
      g.lineStyle(3, 0x3a3a42, 1);
      g.lineBetween(w * 0.48, h * 0.5, w * 0.56, h * 0.5); // 管道
      break;
    }
    case 'barracks': {
      g.fillStyle(c.dark, 1);
      g.fillRect(w * 0.32, h * 0.55, w * 0.36, h * 0.41); // 大门
      g.lineStyle(2, c.accent, 1);
      g.strokeTriangle(w * 0.5, h * 0.16, w * 0.3, h * 0.4, w * 0.7, h * 0.4); // 徽记
      g.fillStyle(c.light, 1);
      g.fillRect(w * 0.12, h * 0.15, w * 0.14, h * 0.3);
      g.fillRect(w * 0.74, h * 0.15, w * 0.14, h * 0.3);
      break;
    }
    case 'warFactory': {
      g.fillStyle(c.dark, 1);
      g.fillRect(w * 0.34, h * 0.3, w * 0.58, h * 0.66); // 装配大门
      g.lineStyle(2, c.accent, 1);
      for (let i = 0; i < 3; i++) g.lineBetween(w * 0.36, h * (0.42 + i * 0.16), w * 0.9, h * (0.42 + i * 0.16));
      g.lineStyle(3, 0x3a3a42, 1);
      g.lineBetween(w * 0.14, h * 0.85, w * 0.14, h * 0.15); // 吊塔
      g.lineBetween(w * 0.14, h * 0.15, w * 0.34, h * 0.15);
      g.fillStyle(c.light, 1);
      g.fillRect(w * 0.08, h * 0.12, 8, 8);
      break;
    }
    case 'turret': {
      g.fillStyle(c.dark, 1);
      g.fillCircle(w / 2, h / 2, 12);
      g.fillStyle(c.accent, 1);
      for (const [px, py] of [
        [5, 5],
        [w - 8, 5],
        [5, h - 8],
        [w - 8, h - 8],
      ]) g.fillRect(px, py, 3, 3); // 铆钉
      break;
    }
  }
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    for (const [key, url] of Object.entries(GENERATED_TEXTURES)) this.load.image(key, url);
  }

  create(): void {
    radialTexture(this, 'fx-soft', 32);
    const factions: Faction[] = ['player', 'enemy'];
    for (const f of factions) {
      const c = FACTION_COLORS[f];
      const unitDraws: Record<UnitKind, (g: G, s: number) => void> = {
        infantry: (g, s) => drawInfantry(g, s, c, false),
        rocket: (g, s) => drawInfantry(g, s, c, true),
        lightTank: (g, s) => drawTank(g, s, c, false),
        heavyTank: (g, s) => drawTank(g, s, c, true),
        harvester: (g, s) => drawHarvester(g, s, c),
        mcv: (g, s) => drawMcv(g, s, c),
      };
      (Object.keys(unitDraws) as UnitKind[]).forEach((kind) => {
        const s = UNIT_STATS[kind].texSize;
        tex(this, `u-${kind}-${f}`, s, s, (g) => unitDraws[kind](g, s));
      });
      (Object.keys(BUILDING_STATS) as BuildingKind[]).forEach((kind) => {
        const [wt, ht] = BUILDING_STATS[kind].size;
        tex(this, `b-${kind}-${f}`, wt * TILE, ht * TILE, (g) => drawBuilding(g, kind, c));
      });
      // 防御塔旋转头
      tex(this, `turret-head-${f}`, 28, 28, (g) => {
        g.fillStyle(c.light, 1);
        g.fillCircle(14, 14, 9);
        g.fillStyle(c.dark, 1);
        g.fillCircle(14, 14, 5.5);
        g.fillStyle(0x33333a, 1);
        g.fillRect(12.5, 0, 3, 13);
        g.fillStyle(c.accent, 1);
        g.fillRect(12.5, 0, 3, 3);
      });
    }
    this.scene.start('game');
  }
}
