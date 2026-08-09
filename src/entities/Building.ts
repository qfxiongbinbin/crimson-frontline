import { BUILDING_STATS, TILE, type BuildingKind, type BuildingStats, type Faction } from '../config';
import { BaseEntity } from './BaseEntity';
import type { GameScene } from '../scenes/GameScene';

export class Building extends BaseEntity {
  readonly kind: BuildingKind;
  readonly stats: BuildingStats;
  readonly isBuilding = true;
  readonly tx: number;
  readonly ty: number;
  readonly wt: number;
  readonly ht: number;

  active = false;
  progress = 0;
  rally: { x: number; y: number } | null = null;
  private rallyGfx: Phaser.GameObjects.Graphics;
  private cd = 0;
  private head: Phaser.GameObjects.Image | null = null;

  constructor(scene: GameScene, kind: BuildingKind, faction: Faction, tx: number, ty: number, instant = false) {
    const stats = BUILDING_STATS[kind];
    const cx = (tx + stats.size[0] / 2) * TILE;
    const cy = (ty + stats.size[1] / 2) * TILE;
    super(scene, cx, cy, faction, stats.hp);
    this.kind = kind;
    this.stats = stats;
    this.tx = tx;
    this.ty = ty;
    this.wt = stats.size[0];
    this.ht = stats.size[1];
    const body = scene.add
      .image(0, 0, `b-${kind}-${faction}`)
      .setDisplaySize(stats.size[0] * TILE, stats.size[1] * TILE);
    this.add(body);
    this.rallyGfx = scene.add.graphics();
    this.add(this.rallyGfx);
    if (kind === 'turret') {
      this.head = scene.add.image(0, 0, `turret-head-${faction}`).setDisplaySize(44, 44);
      this.add(this.head);
    }
    this.setDepth(15);
    if (instant || stats.buildTime <= 0) {
      this.active = true;
    } else {
      this.setAlpha(0.55);
    }
    this.drawOverlay();
  }

  get displayName(): string {
    return this.stats.name;
  }

  get sightTiles(): number {
    return this.stats.sight;
  }

  get footW(): number {
    return this.wt * TILE + 12;
  }

  get barY(): number {
    return (-this.ht * TILE) / 2 - 12;
  }

  get isProducer(): boolean {
    return this.kind === 'barracks' || this.kind === 'warFactory';
  }

  /** 设置集结点并画出持久旗标 */
  setRally(x: number, y: number): void {
    this.rally = { x, y };
    const g = this.rallyGfx;
    g.clear();
    const dx = x - this.x;
    const dy = y - this.y;
    // 引导线（建筑中心 → 集结点）
    g.lineStyle(2, 0x86ff7a, 0.55);
    g.lineBetween(0, 0, dx, dy);
    // 集结点小旗
    g.lineStyle(2, 0x86ff7a, 0.9);
    g.lineBetween(dx, dy, dx, dy - 16);
    g.fillStyle(0x86ff7a, 0.95);
    g.fillTriangle(dx, dy - 16, dx, dy - 8, dx + 10, dy - 12);
    g.fillStyle(0x86ff7a, 0.3);
    g.fillCircle(dx, dy, 7);
  }

  containsPoint(x: number, y: number): boolean {
    return (
      x >= this.tx * TILE &&
      x < (this.tx + this.wt) * TILE &&
      y >= this.ty * TILE &&
      y < (this.ty + this.ht) * TILE
    );
  }

  update(dt: number): void {
    if (!this.alive) return;
    if (!this.active) {
      this.progress += dt;
      this.setAlpha(0.5 + 0.18 * Math.sin(this.progress * 6));
      if (this.progress >= this.stats.buildTime) {
        this.active = true;
        this.setAlpha(1);
        this.gs.onBuildingComplete(this);
      }
      this.drawOverlay();
      return;
    }
    if (this.kind === 'turret') {
      this.cd -= dt;
      if (!this.gs.powerOk(this.faction)) return; // 电力不足，防御塔瘫痪
      const range = this.stats.range ?? 0;
      const target = this.gs.findEnemyInRange(this, range);
      if (target) {
        if (this.head) {
          this.head.setRotation(Math.atan2(target.y - this.y, target.x - this.x) + Math.PI / 2);
        }
        if (this.cd <= 0) {
          this.gs.fireWeapon(this, target, this.stats.damage ?? 0);
          this.cd = this.stats.cooldown ?? 1;
        }
      }
    }
  }

  drawOverlay(): void {
    super.drawOverlay();
    if (!this.active) {
      // 施工进度条（黄色）
      const w = Math.max(26, this.footW * 0.8);
      const ratio = Math.min(1, this.progress / Math.max(0.01, this.stats.buildTime));
      this.overlay.fillStyle(0x000000, 0.6);
      this.overlay.fillRect(-w / 2 - 1, this.barY + 7, w + 2, 5);
      this.overlay.fillStyle(0xe8c53a, 1);
      this.overlay.fillRect(-w / 2, this.barY + 8, w * ratio, 3);
    }
  }
}
