import { HARVEST_RATE, MAP_H, MAP_W, TILE, UNIT_STATS, type Faction, type UnitKind, type UnitStats } from '../config';
import type { TilePos } from '../types';
import { BaseEntity } from './BaseEntity';
import type { GameScene } from '../scenes/GameScene';

type HarvestState = 'idle' | 'toOre' | 'harvesting' | 'toRefinery' | 'unloading';

export class Unit extends BaseEntity {
  readonly kind: UnitKind;
  readonly stats: UnitStats;
  readonly isBuilding = false;
  sprite: Phaser.GameObjects.Image;

  moveTarget: { x: number; y: number } | null = null;
  attackTarget: BaseEntity | null = null;
  attackMove = false;
  /** 驻守点：到达目的地后蹲守于此，追敌过远会撤回 */
  guardPos: { x: number; y: number } | null = null;
  private cd = 0;
  private path: { x: number; y: number }[] = [];
  private pathGoal = '';

  // 采矿车状态
  hState: HarvestState = 'idle';
  load = 0;
  oreTarget: TilePos | null = null;

  constructor(scene: GameScene, kind: UnitKind, faction: Faction, x: number, y: number) {
    const stats = UNIT_STATS[kind];
    super(scene, x, y, faction, stats.hp);
    this.kind = kind;
    this.stats = stats;
    this.sprite = scene.add.image(0, 0, `u-${kind}-${faction}`).setDisplaySize(stats.texSize, stats.texSize);
    this.add(this.sprite);
    this.sprite.setDepth(0);
    this.setDepth(20 + y * 0.001);
    this.drawOverlay();
  }

  get displayName(): string {
    return this.stats.name;
  }

  get sightTiles(): number {
    return this.stats.sight;
  }

  get footW(): number {
    return this.stats.texSize + 14;
  }

  get barY(): number {
    return -this.stats.texSize / 2 - 12;
  }

  get canAttack(): boolean {
    return this.stats.range > 0 && this.stats.damage > 0;
  }

  /** 命令：移动到点 */
  orderMove(x: number, y: number, attackMove = false): void {
    this.clearPath();
    this.moveTarget = { x, y };
    this.attackMove = attackMove;
    if (!attackMove) this.attackTarget = null;
  }

  /** 命令：攻击目标 */
  orderAttack(target: BaseEntity): void {
    this.clearPath();
    this.attackTarget = target;
    this.moveTarget = null;
    this.attackMove = true;
  }

  /** 命令：去指定矿格采矿 */
  orderHarvest(t: TilePos): void {
    if (this.kind !== 'harvester') return;
    this.clearPath();
    this.oreTarget = t;
    this.hState = 'toOre';
    this.moveTarget = null;
    this.attackTarget = null;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.cd -= dt;
    if (this.kind === 'harvester') {
      this.updateHarvester(dt);
      return;
    }
    this.updateCombat(dt);
  }

  private updateCombat(dt: number): void {
    // 目标失效检查
    if (this.attackTarget && !this.attackTarget.alive) this.attackTarget = null;

    if (this.attackTarget) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.attackTarget.x, this.attackTarget.y);
      // 驻守单位追敌 leash：离驻守点太远且目标不在射程内就放弃回撤
      if (
        this.guardPos &&
        d > this.stats.range &&
        Phaser.Math.Distance.Between(this.x, this.y, this.guardPos.x, this.guardPos.y) > 300
      ) {
        this.attackTarget = null;
        return;
      }
      if (this.canAttack && d <= this.stats.range) {
        this.faceToward(this.attackTarget.x, this.attackTarget.y);
        if (this.cd <= 0) {
          this.gs.fireWeapon(this, this.attackTarget, this.stats.damage);
          this.cd = this.stats.cooldown;
        }
      } else {
        this.stepToward(this.attackTarget.x, this.attackTarget.y, dt, Math.max(6, this.stats.range - 8));
      }
      return;
    }

    // 空闲或攻击移动时自动索敌
    if (this.canAttack && (this.attackMove || !this.moveTarget)) {
      const e = this.gs.findEnemyInRange(this, this.stats.sight * TILE);
      if (e) {
        this.attackTarget = e;
        return;
      }
    }

    if (this.moveTarget) {
      if (this.stepToward(this.moveTarget.x, this.moveTarget.y, dt)) {
        this.guardPos = { x: this.x, y: this.y }; // 到达后在此蹲守
        this.moveTarget = null;
        this.attackMove = false;
      }
      return;
    }

    // 无命令且偏离驻守点 → 归位蹲守
    if (this.guardPos) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.guardPos.x, this.guardPos.y);
      if (d > 24) this.stepToward(this.guardPos.x, this.guardPos.y, dt, 16);
    }
  }

  private updateHarvester(dt: number): void {
    // 玩家手动移动指令优先
    if (this.moveTarget) {
      if (this.stepToward(this.moveTarget.x, this.moveTarget.y, dt)) this.moveTarget = null;
      return;
    }
    const capacity = this.stats.capacity ?? 700;
    switch (this.hState) {
      case 'idle': {
        if (this.oreTarget && this.gs.map.oreAt(this.oreTarget.tx, this.oreTarget.ty) <= 0) {
          this.oreTarget = null;
        }
        if (!this.oreTarget) this.oreTarget = this.gs.map.findOreNear(this.x, this.y);
        if (this.oreTarget) this.hState = 'toOre';
        break;
      }
      case 'toOre': {
        if (!this.oreTarget || this.gs.map.oreAt(this.oreTarget.tx, this.oreTarget.ty) <= 0) {
          this.hState = 'idle';
          break;
        }
        const wx = this.oreTarget.tx * TILE + TILE / 2;
        const wy = this.oreTarget.ty * TILE + TILE / 2;
        if (this.stepToward(wx, wy, dt, 26)) this.hState = 'harvesting';
        break;
      }
      case 'harvesting': {
        if (!this.oreTarget) {
          this.hState = 'idle';
          break;
        }
        const got = this.gs.map.depleteOre(this.oreTarget.tx, this.oreTarget.ty, HARVEST_RATE * dt);
        this.load += got;
        if (this.load >= capacity) {
          this.hState = 'toRefinery';
        } else if (got <= 0) {
          this.oreTarget = null;
          this.hState = this.load > 0 ? 'toRefinery' : 'idle';
        }
        break;
      }
      case 'toRefinery': {
        const ref = this.gs.findRefinery(this.faction, this.x, this.y);
        if (!ref) {
          this.hState = 'idle';
          break;
        }
        if (this.stepToward(ref.x, ref.y, dt, 64)) {
          this.gs.deposit(this.faction, Math.round(this.load), this.x, this.y);
          this.load = 0;
          this.hState = 'idle';
        }
        break;
      }
      case 'unloading':
        this.hState = 'idle';
        break;
    }
  }

  private clearPath(): void {
    this.path = [];
    this.pathGoal = '';
  }

  private findPath(targetX: number, targetY: number): { x: number; y: number }[] {
    const map = this.gs.map;
    const width = MAP_W;
    const height = MAP_H;
    const sx = Math.floor(this.x / TILE);
    const sy = Math.floor(this.y / TILE);
    const rawGx = Math.floor(targetX / TILE);
    const rawGy = Math.floor(targetY / TILE);
    if (!map.inBounds(sx, sy) || !map.inBounds(rawGx, rawGy)) return [];

    // 点击建筑或岩石时，选择目标周围离单位最近的可通行格。
    let gx = rawGx;
    let gy = rawGy;
    if (!map.isWalkable(gx, gy)) {
      let best = Infinity;
      for (let r = 1; r <= 8; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const x = rawGx + ox;
            const y = rawGy + oy;
            if (!map.isWalkable(x, y)) continue;
            const score = Math.hypot(x - sx, y - sy);
            if (score < best) {
              best = score;
              gx = x;
              gy = y;
            }
          }
        }
        if (best < Infinity) break;
      }
      if (best === Infinity) return [];
    }

    const start = sy * width + sx;
    const goal = gy * width + gx;
    if (start === goal) return [];
    const parent = new Int16Array(width * height);
    parent.fill(-1);
    const queue = new Int16Array(width * height);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    parent[start] = start;
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const;

    while (head < tail && parent[goal] === -1) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !map.isWalkable(nx, ny)) continue;
        const next = ny * width + nx;
        if (parent[next] !== -1) continue;
        parent[next] = cur;
        queue[tail++] = next;
      }
    }
    if (parent[goal] === -1) return [];

    const reversed: { x: number; y: number }[] = [];
    for (let cur = goal; cur !== start; cur = parent[cur]) {
      const x = cur % width;
      const y = Math.floor(cur / width);
      reversed.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    }
    return reversed.reverse();
  }

  /** 朝目标移动一步；直线受阻时沿网格路径绕开静态障碍。 */
  stepToward(tx: number, ty: number, dt: number, arriveDist = 6): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= arriveDist) return true;
    const step = Math.min(this.stats.speed * dt, d);
    this.faceToward(tx, ty);
    const map = this.gs.map;
    const moveAt = (angle: number): boolean => {
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      // 前探一点，避免单位中心已经贴进障碍后才发现碰撞。
      const probe = step + 12;
      if (!map.isWalkableWorld(this.x + ux * probe, this.y + uy * probe)) return false;
      this.setPosition(this.x + ux * step, this.y + uy * step);
      return true;
    };

    const goalKey = `${Math.floor(tx / TILE)},${Math.floor(ty / TILE)}`;
    if (this.pathGoal !== goalKey) {
      this.path = [];
      this.pathGoal = goalKey;
    }

    if (this.path.length > 0) {
      const waypoint = this.path[0];
      const wd = Phaser.Math.Distance.Between(this.x, this.y, waypoint.x, waypoint.y);
      if (wd <= 5) {
        this.path.shift();
        return false;
      }
      if (moveAt(Math.atan2(waypoint.y - this.y, waypoint.x - this.x))) return false;
      this.path = [];
    }

    const direct = Math.atan2(dy, dx);
    if (moveAt(direct)) return d - step <= arriveDist;

    this.path = this.findPath(tx, ty);
    // 无路可走时保留原命令，后续建筑被摧毁后仍会重试。
    return false;
  }

  faceToward(x: number, y: number): void {
    if (this.kind === 'infantry' || this.kind === 'rocket') return; // 步兵贴图不旋转
    this.sprite.setRotation(Math.atan2(y - this.y, x - this.x) + Math.PI / 2);
  }

  pushFrom(other: Unit): void {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const d = Math.hypot(dx, dy);
    const min = 20;
    if (d >= min || d === 0) return;
    const push = (min - d) / 2;
    const nx = this.x + (dx / d) * push;
    const ny = this.y + (dy / d) * push;
    if (this.gs.map.isWalkableWorld(nx, ny)) this.setPosition(nx, ny);
  }
}
