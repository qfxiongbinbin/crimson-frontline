import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.stack || e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__game && window.__game.scene.isActive(), { timeout: 15000 });
await page.click('.help-close');
await page.mouse.move(720, 450);
await new Promise((r) => setTimeout(r, 600));

// 部署 + 造坦克与敌步兵，镜头对准，真实鼠标：点选坦克 → 右键点敌人
const info = await page.evaluate(() => {
  const game = window.__game;
  const mcv = game.units.find((u) => u.kind === 'mcv');
  game.selected = [mcv];
  game.deployMCV();
  const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
  const tank = game.spawnUnit('lightTank', 'player', cy.x + 150, cy.y);
  const foe = game.spawnUnit('infantry', 'enemy', cy.x + 260, cy.y);
  game.centerCamera(cy.x + 200, cy.y);
  const ts = game.worldToScreen(tank.x, tank.y);
  const fs = game.worldToScreen(foe.x, foe.y);
  return { tank: tank.id, foe: foe.id, ts, fs };
});
console.log('setup', JSON.stringify(info));
await page.mouse.click(info.ts.x, info.ts.y, { button: 'left' });
await new Promise((r) => setTimeout(r, 250));
console.log('selected:', await page.evaluate(() => window.__game.selected.length));
await page.mouse.click(info.fs.x, info.fs.y, { button: 'right' }); // 右键攻击
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 1200));
  const st = await page.evaluate((ids) => {
    const game = window.__game;
    const tank = game.units.find((u) => u.id === ids.tank);
    const foe = game.units.find((u) => u.id === ids.foe);
    return {
      tank: tank ? { hp: Math.round(tank.hp), tgt: !!tank.attackTarget } : 'dead/gone',
      foe: foe ? { hp: Math.round(foe.hp) } : 'dead/gone',
      fps: Math.round(game.game.loop.actualFps),
    };
  }, info);
  console.log(`t=${(i + 1) * 1.2}s`, JSON.stringify(st));
}
await browser.close();
