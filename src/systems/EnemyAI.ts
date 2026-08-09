import { BUILDING_STATS, DIFFICULTY, type BuildingKind, type UnitKind } from '../config';
import { Unit } from '../entities/Unit';
import type { GameScene } from '../scenes/GameScene';

/**
 * 敌方 AI：经济管理 + 建造顺序 + 分批进攻。
 * 所有动作都通过与玩家相同的场景接口执行（canPlace / placeBuilding / enqueueUnit）。
 * 难度参数（资金、决策频率、波次规模）来自 GameScene.difficulty。
 */
export class EnemyAI {
  private scene: GameScene;
  private think = 3;
  private waveCount = 0;
  private buildStep = 0;

  // 建造顺序：电站 → 精炼厂 → 兵营 → 战车工厂 → 防御塔 …
  private readonly buildOrder: BuildingKind[] = [
    'powerPlant',
    'refinery',
    'barracks',
    'warFactory',
    'repairFactory',
    'powerPlant',
    'prismTower',
    'turret',
    'turret',
    'refinery',
    'powerPlant',
    'turret',
  ];

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  private get params() {
    return DIFFICULTY[this.scene.difficulty];
  }

  update(dt: number): void {
    if (this.scene.gameOver) return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.params.thinkInterval;
    this.manageConstruction();
    this.manageProduction();
    this.manageWaves();
    this.manageDefense();
  }

  private count(kind: BuildingKind): number {
    return this.scene.buildings.filter((b) => b.faction === 'enemy' && b.alive && b.kind === kind).length;
  }

  private constructing(): boolean {
    return this.scene.buildings.some((b) => b.faction === 'enemy' && b.alive && !b.active);
  }

  private manageConstruction(): void {
    if (this.constructing()) return;
    const s = this.scene;
    // 电力优先：余量不足就补电站
    const margin = s.powerGen('enemy') - s.powerUse('enemy');
    let want: BuildingKind | null = null;
    if (margin < 30 && this.count('constructionYard') > 0) {
      want = 'powerPlant';
    } else if (this.buildStep < this.buildOrder.length) {
      want = this.buildOrder[this.buildStep];
    } else if (s.credits.enemy > 2600 && this.count('turret') < 5) {
      want = 'turret';
    }
    if (!want) return;
    if (s.credits.enemy < BUILDING_STATS[want].cost) return;
    if (s.aiPlaceBuilding(want)) {
      if (want === this.buildOrder[this.buildStep]) this.buildStep++;
    }
  }

  private manageProduction(): void {
    const s = this.scene;
    if (s.unitQueues.enemy.length >= 3) return;
    const harvesters = s.units.filter((u) => u.faction === 'enemy' && u.alive && u.kind === 'harvester').length;
    const army = s.units.filter(
      (u) => u.faction === 'enemy' && u.alive && u.canAttack,
    ).length;
    if (army >= 26) return;

    let kind: UnitKind;
    if (harvesters < 2 && s.hasProducer('enemy', 'warFactory')) {
      kind = 'harvester';
    } else {
      // 波次越深，重装备比例越高（难度决定重坦登场的早晚）
      const pool: UnitKind[] = ['infantry', 'infantry', 'rocket', 'lightTank'];
      if (this.waveCount >= this.params.heavyWave) pool.push('rocket', 'lightTank', 'heavyTank');
      if (this.waveCount >= this.params.heavyWave + 2) pool.push('heavyTank');
      kind = pool[Math.floor(Math.random() * pool.length)];
      if ((kind === 'lightTank' || kind === 'heavyTank') && !s.hasProducer('enemy', 'warFactory')) {
        kind = 'infantry';
      }
      if ((kind === 'infantry' || kind === 'rocket') && !s.hasProducer('enemy', 'barracks')) return;
    }
    s.enqueueUnit('enemy', kind);
  }

  private idleArmy(): Unit[] {
    return this.scene.units.filter(
      (u) =>
        u.faction === 'enemy' &&
        u.alive &&
        u.canAttack &&
        !u.moveTarget &&
        !u.attackTarget,
    );
  }

  private manageWaves(): void {
    const threshold = Math.min(this.params.waveBase + this.waveCount * 2, this.params.waveCap);
    const idle = this.idleArmy();
    if (idle.length < threshold) return;
    const target = this.scene.playerPrimaryTarget();
    if (!target) return;
    for (const u of idle) u.orderMove(target.x, target.y, true);
    this.waveCount++;
  }

  private manageDefense(): void {
    const cy = this.scene.buildings.find((b) => b.faction === 'enemy' && b.alive && b.kind === 'constructionYard');
    if (!cy) return;
    const invader = this.scene.units.find(
      (u) =>
        u.faction === 'player' &&
        u.alive &&
        u.canAttack &&
        Phaser.Math.Distance.Between(u.x, u.y, cy.x, cy.y) < 480,
    );
    if (!invader) return;
    for (const u of this.idleArmy()) u.orderAttack(invader);
  }
}
