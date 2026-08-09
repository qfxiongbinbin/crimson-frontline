import { BUILDING_STATS, TILE, type BuildingKind, type BuildingStats, type Faction } from '../config';
import { BaseEntity } from './BaseEntity';
import type { GameScene } from '../scenes/GameScene';
import { powerPlantArc, powerPlantFlame, powerPlantSmoke, repairBeam } from '../systems/Effects';

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
  private plantFx: Phaser.GameObjects.Container | null = null;
  private plantGlow: Phaser.GameObjects.Arc | null = null;
  private plantStackLights: Phaser.GameObjects.Arc[] = [];
  private plantFxClock = 0;
  private plantSmokeTimer = 0;
  private plantFlameTimer = 0;
  private plantArcTimer = Phaser.Math.FloatBetween(0.8, 1.8);
  private plantSmokeSide = 1;
  private beaconGlow: Phaser.GameObjects.Arc | null = null;
  private beaconClock = 0;
  private repairGlow: Phaser.GameObjects.Ellipse | null = null;
  private repairFxClock = 0;
  private repairFxTimer = 0;

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
    const [visualW, visualH] = stats.visualSize ?? [stats.size[0] * TILE, stats.size[1] * TILE];
    const shadow = scene.add.ellipse(5, 7, visualW * 0.82, visualH * 0.46, 0x000000, 0.42);
    shadow.setScale(1, 0.82);
    this.add(shadow);
    const body = scene.add
      .image(0, 0, stats.textureKey ?? `b-${kind}-${faction}`)
      .setDisplaySize(visualW, visualH)
      .setPosition(0, -4);
    this.add(body);
    if (kind === 'powerPlant') {
      this.plantFx = scene.add.container(0, 0);
      this.plantGlow = scene.add.circle(0, 14, 15, 0xff6a1f, 0.16);
      this.plantGlow.setBlendMode(Phaser.BlendModes.ADD);
      const leftStack = scene.add.circle(-15, -25, 4.5, 0xff8b2d, 0.2);
      const rightStack = scene.add.circle(15, -25, 4.5, 0xff8b2d, 0.2);
      leftStack.setBlendMode(Phaser.BlendModes.ADD);
      rightStack.setBlendMode(Phaser.BlendModes.ADD);
      this.plantStackLights = [leftStack, rightStack];
      this.plantFx.add([this.plantGlow, ...this.plantStackLights]);
      this.add(this.plantFx);
    }
    if (kind === 'beacon') {
      this.beaconGlow = scene.add.circle(0, -2, 10, 0xff6b22, 0.24);
      this.beaconGlow.setBlendMode(Phaser.BlendModes.ADD);
      this.add(this.beaconGlow);
    }
    if (kind === 'repairFactory') {
      this.repairGlow = scene.add.ellipse(0, 7, 56, 20, 0x6dffd2, 0.12);
      this.repairGlow.setBlendMode(Phaser.BlendModes.ADD);
      this.add(this.repairGlow);
    }
    this.rallyGfx = scene.add.graphics();
    this.add(this.rallyGfx);
    if (kind === 'turret') {
      this.head = scene.add.image(0, -4, `turret-head-${faction}`).setDisplaySize(44, 44);
      this.add(this.head);
    }
    this.setDepth(20 + (ty + stats.size[1]) * TILE * 0.001);
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
    return Math.max(this.wt * TILE, this.stats.visualSize?.[0] ?? 0) + 12;
  }

  get barY(): number {
    return -Math.max(this.ht * TILE, this.stats.visualSize?.[1] ?? 0) / 2 - 12;
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
    if (this.kind === 'powerPlant') this.updatePowerPlantEffects(dt);
    if (this.kind === 'beacon') this.updateBeaconEffects(dt);
    if (this.kind === 'repairFactory') this.updateRepairFactory(dt);
  }

  private updateRepairFactory(dt: number): void {
    if (!this.repairGlow) return;
    this.repairFxClock += dt;
    const powered = this.gs.powerOk(this.faction);
    const pulse = 0.5 + Math.sin(this.repairFxClock * 6.5) * 0.5;
    const factionColor = this.faction === 'player' ? 0x6dffd2 : 0xb99cff;
    this.repairGlow
      .setFillStyle(powered ? factionColor : 0xff684b)
      .setAlpha(powered ? 0.08 + pulse * 0.17 : 0.04 + pulse * 0.03)
      .setScale(0.9 + pulse * 0.18, 0.9 + pulse * 0.12);
    if (!powered) return;

    const range = this.stats.repairRange ?? 0;
    const rate = this.stats.repairRate ?? 0;
    const targets = this.gs.units.filter(
      (u) =>
        u.faction === this.faction &&
        u.alive &&
        u.canAttack &&
        u.hp < u.maxHp &&
        Phaser.Math.Distance.Between(this.x, this.y, u.x, u.y) <= range,
    );
    for (const unit of targets) unit.heal(rate * dt);
    if (targets.length === 0 || !this.visible) return;

    this.repairFxTimer -= dt;
    if (this.repairFxTimer <= 0) {
      this.repairFxTimer = 0.24;
      const target = targets.reduce((best, unit) =>
        unit.hp / unit.maxHp < best.hp / best.maxHp ? unit : best,
      );
      repairBeam(this.gs, this.x, this.y - 8, target.x, target.y, factionColor);
    }
  }

  private updateBeaconEffects(dt: number): void {
    if (!this.beaconGlow) return;
    this.beaconClock += dt;
    const pulse = Math.pow(Math.max(0, Math.sin(this.beaconClock * 5.5)), 3);
    this.beaconGlow.setAlpha(0.08 + pulse * 0.42).setScale(0.75 + pulse * 0.55);
  }

  private updatePowerPlantEffects(dt: number): void {
    if (!this.plantFx || !this.plantGlow) return;
    this.plantFxClock += dt;
    const pulse = 0.5 + Math.sin(this.plantFxClock * 8.5) * 0.5;
    this.plantGlow.setAlpha(0.1 + pulse * 0.22).setScale(0.86 + pulse * 0.3);
    this.plantStackLights[0]?.setAlpha(0.12 + Math.max(0, Math.sin(this.plantFxClock * 11)) * 0.36);
    this.plantStackLights[1]?.setAlpha(0.12 + Math.max(0, -Math.sin(this.plantFxClock * 11)) * 0.36);
    if (!this.visible) return;

    this.plantSmokeTimer -= dt;
    if (this.plantSmokeTimer <= 0) {
      this.plantSmokeTimer = Phaser.Math.FloatBetween(0.16, 0.26);
      this.plantSmokeSide *= -1;
      powerPlantSmoke(this.gs, this.x + this.plantSmokeSide * 15, this.y - 27);
    }

    this.plantFlameTimer -= dt;
    if (this.plantFlameTimer <= 0) {
      this.plantFlameTimer = Phaser.Math.FloatBetween(0.06, 0.11);
      powerPlantFlame(this.gs, this.x, this.y + 17);
    }

    this.plantArcTimer -= dt;
    if (this.plantArcTimer <= 0) {
      this.plantArcTimer = Phaser.Math.FloatBetween(1.2, 2.5);
      powerPlantArc(this.gs, this.x - 15, this.y - 24, this.x + 15, this.y - 24);
    }
  }

  drawOverlay(): void {
    super.drawOverlay();
    if (this.selected && this.kind === 'repairFactory') {
      const range = this.stats.repairRange ?? 0;
      this.overlay.fillStyle(0x6dffd2, 0.025);
      this.overlay.fillCircle(0, 0, range);
      this.overlay.lineStyle(1.5, 0x6dffd2, 0.42);
      this.overlay.strokeCircle(0, 0, range);
    }
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
