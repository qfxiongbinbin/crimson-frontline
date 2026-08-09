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
