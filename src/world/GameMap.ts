import { MAP_H, MAP_W, ORE_PER_TILE, TILE } from '../config';
import type { TilePos } from '../types';
import type { GameScene } from '../scenes/GameScene';

export const T_GROUND = 0;
export const T_ORE = 1;
export const T_ROCK = 2;

// 玩家 / 敌方出生区域（格）：沿主对角线布于地图中部偏两侧，战场从中间展开
export const PLAYER_HOME: TilePos = { tx: 20, ty: 42 };
export const ENEMY_HOME: TilePos = { tx: 42, ty: 20 };

function hash(tx: number, ty: number): number {
  let h = (tx * 73856093) ^ (ty * 19349663);
  h = Math.abs(h);
  return h;
}

export class GameMap {
  readonly scene: GameScene;
  tiles = new Uint8Array(MAP_W * MAP_H);
  ore = new Uint16Array(MAP_W * MAP_H);
  /** 被建筑占用的格子 */
  blocked = new Uint8Array(MAP_W * MAP_H);
  private gfx: Phaser.GameObjects.RenderTexture;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.generate();
    this.gfx = scene.add
      .renderTexture(0, 0, MAP_W * TILE, MAP_H * TILE)
      .setOrigin(0, 0)
      .setDepth(-10);
    this.renderAll();
  }

  idx(tx: number, ty: number): number {
    return ty * MAP_W + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
  }

  private generate(): void {
    // 岩石簇
    const rockSpots = 14;
    for (let i = 0; i < rockSpots; i++) {
      const cx = 6 + Math.floor(Math.random() * (MAP_W - 12));
      const cy = 6 + Math.floor(Math.random() * (MAP_H - 12));
      if (this.nearHome(cx, cy, 9)) continue;
      const r = 1 + Math.floor(Math.random() * 3);
      this.blob(cx, cy, r, T_ROCK);
    }
    // 矿区：双方基地附近各一片，中央两片
    this.oreField(PLAYER_HOME.tx + 7, PLAYER_HOME.ty - 6, 4);
    this.oreField(PLAYER_HOME.tx + 2, PLAYER_HOME.ty - 10, 3);
    this.oreField(ENEMY_HOME.tx - 7, ENEMY_HOME.ty + 6, 4);
    this.oreField(ENEMY_HOME.tx - 2, ENEMY_HOME.ty + 10, 3);
    this.oreField(MAP_W / 2 - 4, MAP_H / 2 - 2, 4);
    this.oreField(MAP_W / 2 + 5, MAP_H / 2 + 4, 3);
  }

  private nearHome(tx: number, ty: number, r: number): boolean {
    return (
      Math.hypot(tx - PLAYER_HOME.tx, ty - PLAYER_HOME.ty) < r ||
      Math.hypot(tx - ENEMY_HOME.tx, ty - ENEMY_HOME.ty) < r
    );
  }

  private blob(cx: number, cy: number, r: number, tile: number): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        if (Math.hypot(x - cx, y - cy) > r) continue;
        if (hash(x, y) % 5 === 0) continue; // 边缘不规则
        this.tiles[this.idx(x, y)] = tile;
      }
    }
  }

  private oreField(cx: number, cy: number, r: number): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        if (hash(x, y) % 7 === 0 && d > 1) continue;
        const i = this.idx(x, y);
        if (this.tiles[i] === T_ROCK) continue;
        this.tiles[i] = T_ORE;
        this.ore[i] = ORE_PER_TILE;
      }
    }
  }

  renderAll(): void {
    this.gfx.clear();
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        this.drawTile(tx, ty);
      }
    }
  }

  redrawTile(tx: number, ty: number): void {
    this.drawTile(tx, ty);
  }

  private drawTile(tx: number, ty: number): void {
    const g = this.gfx;
    const x = tx * TILE;
    const y = ty * TILE;
    const t = this.tiles[this.idx(tx, ty)];
    const h = hash(tx, ty);
    const groundTints = [0xffffff, 0xeeeadd, 0xe4e8d8];
    g.drawFrame(`tile-ground-${h % 4}`, undefined, x, y, 1, groundTints[h % groundTints.length]);
    if (t === T_ROCK) g.drawFrame('tile-rock', undefined, x, y);
    if (t === T_ORE) g.drawFrame('tile-ore', undefined, x, y);
  }

  /** 该格是否可通行（岩石 / 建筑阻挡） */
  isWalkable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    return this.tiles[i] !== T_ROCK && this.blocked[i] === 0;
  }

  isWalkableWorld(x: number, y: number): boolean {
    return this.isWalkable(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  blockFootprint(tx: number, ty: number, w: number, h: number, v: boolean): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (this.inBounds(x, y)) this.blocked[this.idx(x, y)] = v ? 1 : 0;
      }
    }
  }

  tileAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!this.inBounds(tx, ty)) return -1;
    return this.tiles[this.idx(tx, ty)];
  }

  oreAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    return this.ore[this.idx(tx, ty)];
  }

  /** 从矿石格扣减，返回实际采到的量 */
  depleteOre(tx: number, ty: number, want: number): number {
    if (!this.inBounds(tx, ty)) return 0;
    const i = this.idx(tx, ty);
    if (this.tiles[i] !== T_ORE || this.ore[i] === 0) return 0;
    const take = Math.min(want, this.ore[i]);
    this.ore[i] -= take;
    if (this.ore[i] <= 0) {
      this.tiles[i] = T_GROUND;
      this.ore[i] = 0;
      this.redrawTile(tx, ty);
    }
    return take;
  }

  /** 螺旋搜索最近的有矿格 */
  findOreNear(wx: number, wy: number, maxR = 40): TilePos | null {
    const cx = Math.floor(wx / TILE);
    const cy = Math.floor(wy / TILE);
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (!this.inBounds(tx, ty)) continue;
          const i = this.idx(tx, ty);
          if (this.tiles[i] === T_ORE && this.ore[i] > 0) return { tx, ty };
        }
      }
    }
    return null;
  }
}
