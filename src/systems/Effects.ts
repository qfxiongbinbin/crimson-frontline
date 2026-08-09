import type { GameScene } from '../scenes/GameScene';

/** 弹道光束 */
export function tracer(scene: GameScene, x1: number, y1: number, x2: number, y2: number, color: number): void {
  const line = scene.add.line(0, 0, x1, y1, x2, y2, color, 0.95).setOrigin(0, 0).setDepth(600);
  line.setLineWidth(2);
  scene.tweens.add({
    targets: line,
    alpha: 0,
    duration: 130,
    onComplete: () => line.destroy(),
  });
  const flash = scene.add.circle(x1, y1, 4, 0xfff2c8, 0.9).setDepth(601);
  scene.tweens.add({ targets: flash, alpha: 0, scale: 0.3, duration: 110, onComplete: () => flash.destroy() });
}

/** 爆炸效果 */
export function explosion(scene: GameScene, x: number, y: number, big = false): void {
  const r = big ? 34 : 16;
  const ring = scene.add.circle(x, y, r * 0.4, 0xffa030, 0.85).setDepth(650);
  scene.tweens.add({
    targets: ring,
    radius: r,
    alpha: 0,
    duration: big ? 520 : 320,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
  const core = scene.add.circle(x, y, r * 0.25, 0xfff0b8, 1).setDepth(651);
  scene.tweens.add({
    targets: core,
    radius: r * 0.6,
    alpha: 0,
    duration: big ? 380 : 220,
    onComplete: () => core.destroy(),
  });
  const sparks = big ? 10 : 5;
  for (let i = 0; i < sparks; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.8 + Math.random());
    const s = scene.add.circle(x, y, 2.5, 0xffc860, 1).setDepth(652);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      duration: 300 + Math.random() * 250,
      onComplete: () => s.destroy(),
    });
  }
}

/** 集结点小旗标 */
export function rallyFlag(scene: GameScene, x: number, y: number): void {
  const c = scene.add.circle(x, y, 6, 0x7dff7a, 0.7).setDepth(590);
  scene.tweens.add({ targets: c, alpha: 0, scale: 2, duration: 500, onComplete: () => c.destroy() });
}

/** 浮动文字（如 +资金） */
export function floatText(scene: GameScene, x: number, y: number, text: string, color = '#ffd27a'): void {
  const t = scene.add
    .text(x, y - 14, text, { fontSize: '13px', color, fontStyle: 'bold' })
    .setOrigin(0.5)
    .setDepth(660);
  scene.tweens.add({
    targets: t,
    y: y - 44,
    alpha: 0,
    duration: 900,
    onComplete: () => t.destroy(),
  });
}

/** 维修工厂到受损单位的短促能量束与焊接火花。 */
export function repairBeam(
  scene: GameScene,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = 0x6dffd2,
): void {
  const beam = scene.add.line(0, 0, x1, y1, x2, y2 - 3, color, 0.78).setOrigin(0, 0).setDepth(610);
  beam.setLineWidth(1.5);
  beam.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 190,
    onComplete: () => beam.destroy(),
  });

  const pulse = scene.add.circle(x2, y2 - 3, 4, color, 0.9).setDepth(611);
  pulse.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: pulse,
    scale: 2.1,
    alpha: 0,
    duration: 260,
    onComplete: () => pulse.destroy(),
  });

  for (let i = 0; i < 3; i++) {
    const spark = scene.add.circle(x2, y2 - 3, 1.3, 0xffdb72, 0.95).setDepth(612);
    const a = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    const d = Phaser.Math.Between(7, 14);
    scene.tweens.add({
      targets: spark,
      x: x2 + Math.cos(a) * d,
      y: y2 - 3 + Math.sin(a) * d,
      alpha: 0,
      duration: Phaser.Math.Between(180, 300),
      onComplete: () => spark.destroy(),
    });
  }
}

/** 基地工程车引擎排气；移动时同时扬起履带尘土。 */
export function engineExhaust(scene: GameScene, x: number, y: number, heading: number, moving: boolean): void {
  const backX = -Math.cos(heading);
  const backY = -Math.sin(heading);
  const smoke = scene.add
    .image(x + Phaser.Math.Between(-2, 2), y + Phaser.Math.Between(-2, 2), 'fx-soft')
    .setTint(0x59605a)
    .setAlpha(0.52)
    .setDisplaySize(Phaser.Math.FloatBetween(6, 9), Phaser.Math.FloatBetween(6, 9))
    .setDepth(19);
  scene.tweens.add({
    targets: smoke,
    x: x + backX * Phaser.Math.Between(9, 15) + Phaser.Math.Between(-4, 4),
    y: y + backY * Phaser.Math.Between(9, 15) - Phaser.Math.Between(7, 13),
    scale: Phaser.Math.FloatBetween(1.8, 2.6),
    alpha: 0,
    duration: Phaser.Math.Between(520, 760),
    ease: 'Sine.easeOut',
    onComplete: () => smoke.destroy(),
  });

  if (Math.random() < 0.55) {
    const ember = scene.add
      .image(x, y, 'fx-soft')
      .setTint(0xffa33a)
      .setAlpha(0.95)
      .setDisplaySize(Phaser.Math.FloatBetween(3, 5), Phaser.Math.FloatBetween(3, 5))
      .setDepth(21);
    ember.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ember,
      x: x + backX * Phaser.Math.Between(5, 11) + Phaser.Math.Between(-2, 2),
      y: y + backY * Phaser.Math.Between(5, 11) + Phaser.Math.Between(-2, 2),
      scale: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(160, 260),
      onComplete: () => ember.destroy(),
    });
  }

  if (moving) {
    const dust = scene.add
      .image(x, y + 2, 'fx-soft')
      .setTint(0x7a6849)
      .setAlpha(0.3)
      .setDisplaySize(Phaser.Math.FloatBetween(7, 11), Phaser.Math.FloatBetween(5, 8))
      .setDepth(18);
    scene.tweens.add({
      targets: dust,
      x: x + backX * Phaser.Math.Between(10, 18) + Phaser.Math.Between(-5, 5),
      y: y + backY * Phaser.Math.Between(10, 18) + Phaser.Math.Between(-2, 3),
      scale: Phaser.Math.FloatBetween(1.8, 2.8),
      alpha: 0,
      duration: Phaser.Math.Between(420, 650),
      onComplete: () => dust.destroy(),
    });
  }
}

/** 发电站烟囱持续排烟。 */
export function powerPlantSmoke(scene: GameScene, x: number, y: number): void {
  const smoke = scene.add
    .image(x + Phaser.Math.Between(-2, 2), y, 'fx-soft')
    .setTint(0x4d534e)
    .setAlpha(0.52)
    .setDisplaySize(Phaser.Math.FloatBetween(8, 12), Phaser.Math.FloatBetween(8, 12))
    .setDepth(17);
  scene.tweens.add({
    targets: smoke,
    x: x + Phaser.Math.Between(-8, 8),
    y: y - Phaser.Math.Between(18, 28),
    scale: Phaser.Math.FloatBetween(1.9, 2.8),
    alpha: 0,
    duration: Phaser.Math.Between(1050, 1500),
    ease: 'Sine.easeOut',
    onComplete: () => smoke.destroy(),
  });
}

/** 发电站炉膛喷出的火星与热焰。 */
export function powerPlantFlame(scene: GameScene, x: number, y: number): void {
  const color = Math.random() < 0.35 ? 0xfff0a0 : Math.random() < 0.6 ? 0xffb13b : 0xff681f;
  const flame = scene.add
    .image(x + Phaser.Math.Between(-4, 4), y, 'fx-soft')
    .setTint(color)
    .setAlpha(0.92)
    .setDisplaySize(Phaser.Math.FloatBetween(3, 6), Phaser.Math.FloatBetween(4, 7))
    .setDepth(18);
  flame.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flame,
    x: flame.x + Phaser.Math.Between(-4, 4),
    y: y - Phaser.Math.Between(8, 16),
    scaleX: 0.35,
    scaleY: 1.8,
    alpha: 0,
    duration: Phaser.Math.Between(260, 460),
    ease: 'Quad.easeOut',
    onComplete: () => flame.destroy(),
  });
}

/** 发电站双塔之间的短促高压电弧。 */
export function powerPlantArc(scene: GameScene, x1: number, y1: number, x2: number, y2: number): void {
  const arc = scene.add.graphics().setDepth(19);
  arc.setBlendMode(Phaser.BlendModes.ADD);
  const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x1, y1)];
  const segments = 6;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    points.push(new Phaser.Math.Vector2(Phaser.Math.Linear(x1, x2, t), Phaser.Math.Linear(y1, y2, t) + Phaser.Math.Between(-4, 4)));
  }
  points.push(new Phaser.Math.Vector2(x2, y2));
  arc.lineStyle(4, 0x5fbfff, 0.18);
  arc.strokePoints(points);
  arc.lineStyle(1.2, 0xd8f7ff, 0.95);
  arc.strokePoints(points);
  scene.tweens.add({
    targets: arc,
    alpha: 0,
    duration: Phaser.Math.Between(90, 150),
    onComplete: () => arc.destroy(),
  });
}
