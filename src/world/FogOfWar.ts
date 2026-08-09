import { MAP_H, MAP_W, TILE } from '../config';
import type { BaseEntity } from '../entities/BaseEntity';
import type { GameScene } from '../scenes/GameScene';

const UNSEEN = 0;
const EXPLORED = 1;
const VISIBLE = 2;

/** 战争迷雾：格级可见度，0 未见 / 1 已探索 / 2 当前可见 */
export class FogOfWar {
  readonly scene: GameScene;
  grid = new Uint8Array(MAP_W * MAP_H);
  private ct: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;

  constructor(scene: GameScene) {
    this.scene = scene;
    const ct = scene.textures.createCanvas('fog', MAP_W, MAP_H);
    if (!ct) throw new Error('无法创建迷雾画布');
    this.ct = ct;
    this.img = scene.add
      .image(0, 0, 'fog')
      .setOrigin(0, 0)
      .setDisplaySize(MAP_W * TILE, MAP_H * TILE)
      .setDepth(900);
  }

  idx(tx: number, ty: number): number {
    return ty * MAP_W + tx;
  }

  /** 依据玩家方所有单位与建筑重新计算可见区 */
  recompute(entities: BaseEntity[]): void {
    const g = this.grid;
    for (let i = 0; i < g.length; i++) {
      if (g[i] === VISIBLE) g[i] = EXPLORED;
    }
    for (const e of entities) {
      if (e.faction !== 'player' || !e.alive) continue;
      const cx = Math.floor(e.x / TILE);
      const cy = Math.floor(e.y / TILE);
      const r = e.sightTiles;
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
          if (Math.hypot(x - cx, y - cy) <= r) g[this.idx(x, y)] = VISIBLE;
        }
      }
    }
    this.redraw();
  }

  private redraw(): void {
    const ctx = this.ct.getContext();
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const v = this.grid[this.idx(tx, ty)];
        if (v === VISIBLE) continue;
        ctx.fillStyle = v === UNSEEN ? 'rgba(6,8,7,1)' : 'rgba(6,8,7,0.55)';
        ctx.fillRect(tx, ty, 1.02, 1.02);
      }
    }
    this.ct.refresh();
  }

  isVisibleWorld(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.grid[this.idx(tx, ty)] === VISIBLE;
  }

  isExploredWorld(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.grid[this.idx(tx, ty)] >= EXPLORED;
  }
}
