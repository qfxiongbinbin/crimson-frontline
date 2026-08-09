import { HARVEST_RATE, MAP_H, MAP_W, TILE, UNIT_STATS, type Faction, type UnitKind, type UnitStats } from '../config';
import type { TilePos } from '../types';
import { BaseEntity } from './BaseEntity';
import type { GameScene } from '../scenes/GameScene';
import { engineExhaust } from '../systems/Effects';

type HarvestState = 'idle' | 'toOre' | 'harvesting' | 'toRefinery' | 'unloading';

export class Unit extends BaseEntity {
  readonly kind: UnitKind;
  readonly stats: UnitStats;
  readonly isBuilding = false;
  sprite: Phaser.GameObjects.Image;
  private readonly visualSize: number;
  private castShadow: Phaser.GameObjects.Ellipse;
  private contactShadow: Phaser.GameObjects.Ellipse;
  private motionClock = 0;

  moveTarget: { x: number; y: number } | null = null;
  attackTarget: BaseEntity | null = null;
  attackMove = false;
  /** 驻守点：到达目的地后蹲守于此，追敌过远会撤回 */
  guardPos: { x: number; y: number } | null = null;
  private cd = 0;
  private path: { x: number; y: number }[] = [];
  private pathGoal = '';
  private mcvFx: Phaser.GameObjects.Container | null = null;
  private mcvEngineGlow: Phaser.GameObjects.Arc | null = null;
  private mcvLamps: Phaser.GameObjects.Arc[] = [];
  private mcvFxClock = 0;
  private mcvExhaustTimer = 0;
  private mcvExhaustSide = 1;

  // 采矿车状态
  hState: HarvestState = 'idle';
  load = 0;
  oreTarget: TilePos | null = null;

  constructor(scene: GameScene, kind: UnitKind, faction: Faction, x: number, y: number) {
    const stats = UNIT_STATS[kind];
    super(scene, x, y, faction, stats.hp);
    this.kind = kind;
    this.stats = stats;
    const infantryScale = kind === 'infantry' || kind === 'rocket' ? 1.1 : 1.24;
    this.visualSize = stats.texSize * infantryScale;
    this.castShadow = scene.add.ellipse(5, 6, this.visualSize * 0.7, this.visualSize * 0.3, 0x000000, 0.38);
    this.castShadow.setScale(1, 0.78);
    this.addAt(this.castShadow, 0);
    this.contactShadow = scene.add.ellipse(0, 3, this.visualSize * 0.46, this.visualSize * 0.17, 0x000000, 0.58);
    this.addAt(this.contactShadow, 1);
    this.sprite = scene.add
      .image(0, -4, `u-${kind}-${faction}`)
      .setDisplaySize(this.visualSize, this.visualSize);
    this.add(this.sprite);
    this.sprite.setDepth(0);
    if (kind === 'mcv') {
      this.mcvFx = scene.add.container(0, 0);
      this.mcvEngineGlow = scene.add.circle(0, 16, 10, 0xff711f, 0.16);
      this.mcvEngineGlow.setBlendMode(Phaser.BlendModes.ADD);
      const leftLamp = scene.add.circle(-14, 10, 1.5, 0xffd45f, 0.82);
      const rightLamp = scene.add.circle(14, 10, 1.5, 0xff3d28, 0.82);
      leftLamp.setBlendMode(Phaser.BlendModes.ADD);
      rightLamp.setBlendMode(Phaser.BlendModes.ADD);
      this.mcvLamps = [leftLamp, rightLamp];
      this.mcvFx.add([this.mcvEngineGlow, ...this.mcvLamps]);
      this.add(this.mcvFx);
    }
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
    return this.visualSize + 12;
  }

  get barY(): number {
    return -this.visualSize / 2 - 14;
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
    const beforeX = this.x;
    const beforeY = this.y;
    this.cd -= dt;
    if (this.kind === 'harvester') {
      this.updateHarvester(dt);
    } else {
      this.updateCombat(dt);
    }
    const moved = Phaser.Math.Distance.Between(beforeX, beforeY, this.x, this.y) > 0.05;
    this.updatePseudo3d(dt, moved);
    if (this.kind === 'mcv') this.updateMcvEffects(dt, moved);
  }

  /** 伪 3D：离地投影、车体高度与移动悬挂起伏，逻辑坐标仍保持二维网格。 */
  private updatePseudo3d(dt: number, moving: boolean): void {
    this.motionClock += dt;
    const infantry = this.kind === 'infantry' || this.kind === 'rocket';
    const amplitude = moving ? (infantry ? 0.45 : 0.85) : infantry ? 0.08 : 0.16;
    const speed = moving ? (infantry ? 13 : 9.5) : 2.8;
    const bob = Math.sin(this.motionClock * speed + this.id * 0.73) * amplitude;
    const sway = moving ? Math.cos(this.motionClock * speed * 0.5 + this.id) * (infantry ? 0.25 : 0.38) : 0;
    const lift = infantry ? -2.2 : -4.2;
    this.sprite.setPosition(sway, lift + bob);
    this.castShadow
      .setPosition(5 - sway * 0.25, 6)
      .setScale(1 - bob * 0.025, 0.78 - bob * 0.018)
      .setAlpha(0.34 - bob * 0.018);
    this.contactShadow.setScale(1 - bob * 0.02, 1 - bob * 0.035).setAlpha(0.54 - bob * 0.025);
    this.setDepth(20 + this.y * 0.001);
  }

  private updateMcvEffects(dt: number, moving: boolean): void {
    if (!this.mcvFx || !this.mcvEngineGlow) return;
    this.mcvFxClock += dt;
    const vibration = moving ? 0.42 : 0.24;
    const jitterX = Math.sin(this.mcvFxClock * 31) * vibration;
    const jitterY = Math.cos(this.mcvFxClock * 27) * vibration * 0.65;
    this.mcvFx
      .setPosition(this.sprite.x + jitterX, this.sprite.y + jitterY)
      .setRotation(this.sprite.rotation);

    const enginePulse = 0.5 + Math.sin(this.mcvFxClock * 18) * 0.5;
    this.mcvEngineGlow.setAlpha(0.1 + enginePulse * 0.2).setScale(0.86 + enginePulse * 0.25);
    this.mcvLamps[0]?.setAlpha(0.3 + Math.max(0, Math.sin(this.mcvFxClock * 9)) * 0.7);
    this.mcvLamps[1]?.setAlpha(0.3 + Math.max(0, -Math.sin(this.mcvFxClock * 9)) * 0.7);

    this.mcvExhaustTimer -= dt;
    if (this.mcvExhaustTimer > 0 || !this.visible) return;
    this.mcvExhaustTimer = moving ? 0.09 : 0.16;
    this.mcvExhaustSide *= -1;
    const rotation = this.sprite.rotation;
    const localX = this.mcvExhaustSide * 9;
    const localY = 21;
    const exhaustX = this.x + localX * Math.cos(rotation) - localY * Math.sin(rotation);
    const exhaustY = this.y + localX * Math.sin(rotation) + localY * Math.cos(rotation);
    engineExhaust(this.gs, exhaustX, exhaustY, rotation - Math.PI / 2, moving);
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
