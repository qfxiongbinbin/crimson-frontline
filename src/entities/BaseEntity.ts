import type { Faction } from '../config';
import type { GameScene } from '../scenes/GameScene';

let nextId = 1;

export abstract class BaseEntity extends Phaser.GameObjects.Container {
  readonly id: number = nextId++;
  faction: Faction;
  hp: number;
  maxHp: number;
  alive = true;
  selected = false;
  abstract readonly sightTiles: number;
  abstract readonly displayName: string;
  abstract readonly isBuilding: boolean;
  /** 选中圈 / 血条宽度（像素） */
  abstract readonly footW: number;
  abstract readonly barY: number;

  protected overlay: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene, x: number, y: number, faction: Faction, maxHp: number) {
    super(scene, x, y);
    this.faction = faction;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.overlay = scene.add.graphics();
    this.add(this.overlay);
    scene.add.existing(this);
    // 注意：不能在此调用 drawOverlay() —— 子类字段尚未初始化
  }

  get gs(): GameScene {
    return this.scene as GameScene;
  }

  setSelected(v: boolean): void {
    if (this.selected === v) return;
    this.selected = v;
    this.drawOverlay();
  }

  takeDamage(n: number): void {
    if (!this.alive) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.gs.onEntityDied(this);
      this.destroy();
      return;
    }
    this.drawOverlay();
  }

  drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    if (this.selected) {
      g.lineStyle(2, 0x86ff7a, 0.95);
      g.strokeEllipse(0, 0, this.footW, this.footW * 0.62);
    }
    // 血条：仅选中或受损时显示，避免密集工事遮挡画面
    if (!this.selected && this.hp >= this.maxHp) return;
    const w = Math.max(26, this.footW * 0.8);
    const ratio = this.hp / this.maxHp;
    const color = ratio > 0.6 ? 0x51d94f : ratio > 0.3 ? 0xe8b23a : 0xe0483a;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(-w / 2 - 1, this.barY - 1, w + 2, 6);
    g.fillStyle(color, 1);
    g.fillRect(-w / 2, this.barY, w * ratio, 4);
  }
}
