// 自动化冒烟试玩：真实启动 Chrome，模拟点击/按键，逐项验证核心玩法
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GAME_URL = 'http://localhost:5173';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let page;

function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

const g = (fn, ...args) => page.evaluate(fn, ...args);

async function state() {
  return g(() => window.__game.debugState());
}

// 在玩家基地附近找一个可建造位置，返回屏幕坐标
async function findPlaceSpot(kind) {
  // 先把镜头对准己方指挥中心（与真实玩家卷屏等效）
  await g(() => {
    const game = window.__game;
    const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
    if (cy) game.centerCamera(cy.x, cy.y);
  });
  await sleep(100);
  return g((k) => {
    const game = window.__game;
    const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
    if (!cy) return null;
    for (let r = 2; r < 9; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cy.tx + dx;
          const ty = cy.ty + dy;
          if (game.canPlace(k, tx, ty, 'player')) {
            const s = game.worldToScreen((tx + 1) * 32, (ty + 1) * 32);
            if (s.x > 40 && s.x < 1200 && s.y > 60 && s.y < 800) return { tx, ty, sx: s.x, sy: s.y };
          }
        }
      }
    }
    return null;
  }, kind);
}

async function buildAndWait(kind, waitMs) {
  const spot = await findPlaceSpot(kind);
  if (!spot) return { ok: false, why: '找不到可建造位置' };
  await g((k) => window.__game.uiAction('place', k), kind);
  await sleep(150);
  await page.mouse.click(spot.sx, spot.sy, { button: 'left' });
  await sleep(200);
  await sleep(waitMs);
  return { ok: true };
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--window-size=1440,900', '--mute-audio'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${(e.stack || e.message).slice(0, 500)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(`console: ${m.text()}`);
  });

  // 等待 dev server
  for (let i = 0; i < 30; i++) {
    try {
      await page.goto(GAME_URL, { timeout: 3000 });
      break;
    } catch {
      await sleep(1000);
    }
  }
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive(), { timeout: 15000 });
  // 帮助面板：开局显示、可关闭
  const helpShown = await g(() => {
    const h = document.querySelector('#help');
    return !!h && getComputedStyle(h).display !== 'none';
  });
  const pausedBefore = await state();
  await sleep(3400); // 超过 AI 首次思考时间，确认说明页背后的战局没有偷跑
  const pausedAfter = await state();
  report(
    '帮助面板显示时战局暂停',
    pausedAfter.paused === true &&
      pausedAfter.credits.enemy === pausedBefore.credits.enemy &&
      pausedAfter.buildings.length === pausedBefore.buildings.length &&
      pausedAfter.units.length === pausedBefore.units.length,
    `paused=${pausedAfter.paused} enemyCredits=${pausedBefore.credits.enemy}→${pausedAfter.credits.enemy}`,
  );
  await page.click('.help-close');
  await sleep(150);
  const helpHidden = await g(() => {
    const h = document.querySelector('#help');
    return !!h && getComputedStyle(h).display === 'none';
  });
  const resumed = (await state()).paused === false;
  report('帮助面板开局显示并可关闭', helpShown && helpHidden && resumed);

  // --- 难度切换 ---
  await g(() => window.__game.setDifficulty('hard'));
  await sleep(150);
  const dst = await state();
  const hardOk = dst.credits.enemy >= 7000;
  await g(() => window.__game.setDifficulty('normal'));
  report('难度切换生效（困难提升 AI 资金）', hardOk, `enemyCredits=${dst.credits.enemy}`);
  // 无头环境下指针默认停在 (0,0) 会触发边缘滚屏，先停到屏幕中央
  await page.mouse.move(720, 450);
  await sleep(1500);
  await shot('01-start');
  report('页面加载且游戏启动', consoleErrors.length === 0, consoleErrors.join(' | ') || '无报错');

  // --- T2 工程车部署 ---
  await g(() => {
    const game = window.__game;
    const mcv = game.units.find((u) => u.kind === 'mcv');
    game.centerCamera(mcv.x, mcv.y);
  });
  await sleep(150);
  const mcvPos = await g(() => {
    const game = window.__game;
    const mcv = game.units.find((u) => u.kind === 'mcv');
    return game.worldToScreen(mcv.x, mcv.y);
  });
  await page.mouse.click(mcvPos.x, mcvPos.y, { button: 'left' });
  await sleep(300);
  let st = await state();
  report('左键点选工程车', st.selected === 1, `selected=${st.selected}`);
  await page.keyboard.press('f');
  await sleep(500);
  st = await state();
  const hasCY = st.buildings.some((b) => b.faction === 'player' && b.kind === 'constructionYard');
  report('按 F 部署为指挥中心', hasCY);
  await shot('02-deployed');

  // --- T3 建造发电站 ---
  let r = await buildAndWait('powerPlant', 6500);
  st = await state();
  const power = st.buildings.find((b) => b.faction === 'player' && b.kind === 'powerPlant');
  report('建造发电站（框选位置+完工）', r.ok && !!power && power.active, r.why || `active=${power && power.active}`);
  report('电力统计生效', st.power.gen > 0, `gen=${st.power.gen}`);
  await shot('03-powerplant');

  // --- T4 建造精炼厂（附赠采矿车） ---
  r = await buildAndWait('refinery', 8500);
  st = await state();
  const refinery = st.buildings.find((b) => b.faction === 'player' && b.kind === 'refinery');
  const harvester = st.units.find((u) => u.faction === 'player' && u.kind === 'harvester');
  report('建造精炼厂并附赠采矿车', r.ok && !!refinery?.active && !!harvester, r.why || '');
  await shot('04-refinery');

  // --- T5 自动采矿 ---
  const before = (await state()).credits.player;
  await sleep(22000);
  st = await state();
  const after = st.credits.player;
  const hv = st.units.find((u) => u.faction === 'player' && u.kind === 'harvester');
  report('采矿车自动采矿增加资金', after > before, `${before} → ${after}（状态=${hv?.hState}）`);
  await shot('05-mining');

  // --- T6 点选 + 右键移动 ---
  const hvPos = await g(() => {
    const game = window.__game;
    const h = game.units.find((u) => u.faction === 'player' && u.kind === 'harvester');
    return game.worldToScreen(h.x, h.y);
  });
  await page.mouse.click(hvPos.x, hvPos.y, { button: 'left' });
  await sleep(200);
  const selN = (await state()).selected;
  const moveFrom = await g(() => {
    const game = window.__game;
    const h = game.units.find((u) => u.faction === 'player' && u.kind === 'harvester');
    return { x: h.x, y: h.y };
  });
  await page.mouse.click(hvPos.x + 150, hvPos.y, { button: 'right' });
  await sleep(1500);
  const moveTo = await g(() => {
    const game = window.__game;
    const h = game.units.find((u) => u.faction === 'player' && u.kind === 'harvester');
    return { x: h.x, y: h.y };
  });
  const moved = Math.hypot(moveTo.x - moveFrom.x, moveTo.y - moveFrom.y);
  report('右键移动单位', selN === 1 && moved > 30 && moved < 400, `选中=${selN} 位移=${Math.round(moved)}px`);

  // --- T7 兵营 + 生产步兵 ---
  r = await buildAndWait('barracks', 8500);
  st = await state();
  const barracks = st.buildings.find((b) => b.faction === 'player' && b.kind === 'barracks');
  report('建造兵营', r.ok && !!barracks?.active, r.why || '');
  await g(() => window.__game.uiAction('enqueue', 'infantry'));
  await sleep(300);
  st = await state();
  report('步兵加入生产队列', st.queue.length === 1, `queue=${st.queue.join(',')}`);
  await sleep(5000);
  st = await state();
  report('步兵生产完成出厂', st.units.some((u) => u.faction === 'player' && u.kind === 'infantry'));

  // --- T7b 集结点：出厂单位前往并蹲守 ---
  await g(() => {
    const game = window.__game;
    const enemyCY = game.buildings.find((b) => b.faction === 'enemy' && b.kind === 'constructionYard');
    // 隔离 AI 进攻波，避免随机交战污染集结点位置断言。
    game.ai.think = 999;
    for (const u of game.units.filter((u) => u.faction === 'enemy' && u.canAttack)) {
      u.setPosition(enemyCY.x, enemyCY.y);
      u.moveTarget = null;
      u.attackTarget = null;
    }
  });
  const bkPos = await g(() => {
    const game = window.__game;
    const b = game.buildings.find((b) => b.faction === 'player' && b.kind === 'barracks');
    const s = game.worldToScreen(b.x, b.y);
    return { sx: s.x, sy: s.y, wx: b.x, wy: b.y };
  });
  await page.mouse.click(bkPos.sx, bkPos.sy, { button: 'left' }); // 选中兵营
  await sleep(200);
  await page.mouse.click(bkPos.sx + 180, bkPos.sy, { button: 'right' }); // 设集结点
  await sleep(200);
  await g(() => window.__game.uiAction('enqueue', 'infantry'));
  await sleep(9500); // 4s 生产 + 步行前往
  const rallyCheck = await g((exp) => {
    const game = window.__game;
    const b = game.buildings.find((b) => b.faction === 'player' && b.kind === 'barracks');
    const inf = game.units.filter((u) => u.faction === 'player' && u.kind === 'infantry');
    const last = inf[inf.length - 1];
    if (!last) return { rallyOk: !!b.rally, near: false, found: false, x: 0, y: 0 };
    const d = Math.hypot(last.x - exp.x, last.y - exp.y);
    return { rallyOk: !!b.rally, near: d < 90, found: true, d: Math.round(d), x: last.x, y: last.y };
  }, { x: bkPos.wx + 150, y: bkPos.wy - 30 }); // 单兵编队偏移 (-30,-30)
  await sleep(2500); // 再观察确认蹲守不动
  const stay = await g((p) => {
    const game = window.__game;
    const inf = game.units.filter((u) => u.faction === 'player' && u.kind === 'infantry');
    const last = inf[inf.length - 1];
    return last ? Math.hypot(last.x - p.x, last.y - p.y) : 999;
  }, rallyCheck);
  report('集结点：新单位出厂前往并蹲守', rallyCheck.rallyOk && rallyCheck.near && stay < 30, `到位=${rallyCheck.near} 漂移=${Math.round(stay)}px`);
  await g(() => {
    window.__game.ai.think = 0;
  });

  // --- T8 静态障碍绕行（放在经济与集结点验证后，避免额外等待让 AI 提前进攻） ---
  const routeProbe = await g(() => {
    const game = window.__game;
    const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
    const unit = game.spawnUnit('lightTank', 'player', cy.x - 150, cy.y);
    const targetX = cy.x + 150;
    unit.orderMove(targetX, cy.y);
    return { id: unit.id, targetX };
  });
  await sleep(6500);
  const routeCheck = await g(({ id, targetX }) => {
    const game = window.__game;
    const unit = game.units.find((u) => u.id === id);
    const result = {
      found: !!unit,
      x: unit ? Math.round(unit.x) : 0,
      y: unit ? Math.round(unit.y) : 0,
      reached: !!unit && unit.x > targetX - 40,
      paused: game.paused,
      gameOver: game.gameOver,
      moveTarget: unit?.moveTarget,
    };
    if (unit) unit.takeDamage(999999);
    return result;
  }, routeProbe);
  report('单位可绕过建筑继续执行移动命令', routeCheck.found && routeCheck.reached, JSON.stringify({ ...routeCheck, targetX: routeProbe.targetX }));

  // --- T8b 工事页：素材、阻挡与地图工程 ---
  const fortCheck = await g(() => {
    const game = window.__game;
    const buttons = [...document.querySelectorAll('#btn-grid .build-btn')].filter(
      (b) => b.dataset.group === 'fortifications',
    );
    const wall = game.placeBuilding('wall', 'player', 2, 2, true);
    const wallBlocks = game.map.blocked[game.map.idx(2, 2)] === 1;
    const crater = game.placeBuilding('crater', 'player', 5, 2, true);
    const craterPassable = game.map.blocked[game.map.idx(5, 2)] === 0;
    game.placeTerrainProject('groundPatch', 2, 5);
    game.placeTerrainProject('oreDeposit', 5, 5);
    const groundPlaced = game.map.groundVariant[game.map.idx(2, 5)] === 0;
    const oreBefore = game.map.oreAt(5, 5);
    const mined = game.map.depleteOre(5, 5, 50);
    const oreAfter = game.map.oreAt(5, 5);
    const remoteWall = game.placeBuilding('wall', 'player', 55, 55, true);
    const cannotChain = !game.canPlace('wall', 57, 55, 'player');
    wall?.takeDamage(999999);
    crater?.takeDamage(999999);
    remoteWall?.takeDamage(999999);
    return {
      buttonCount: buttons.length,
      labels: buttons.map((b) => b.textContent?.trim()),
      wallBlocks,
      craterPassable,
      groundPlaced,
      oreBefore,
      mined,
      oreAfter,
      cannotChain,
    };
  });
  report('工事页包含十种可建设素材', fortCheck.buttonCount === 10, fortCheck.labels.join('、'));
  report('城墙阻挡而弹坑允许单位穿行', fortCheck.wallBlocks && fortCheck.craterPassable);
  report(
    '路面铺装与人工矿脉会修改地图格',
    fortCheck.groundPlaced && fortCheck.oreBefore === 300 && fortCheck.mined === 50 && fortCheck.oreAfter === 250,
    `ore=${fortCheck.oreBefore}→${fortCheck.oreAfter}`,
  );
  report('工事不能接龙扩张建造范围', fortCheck.cannotChain);

  // --- T9 AI 发展（必须在战斗机制的敌军清场前验证） ---
  st = await state();
  const enemyBuildings = st.buildings.filter((b) => b.faction === 'enemy').length;
  report('敌方 AI 持续建造扩张', enemyBuildings >= 4, `敌方建筑=${enemyBuildings}`);
  const enemyUnits = st.units.filter((u) => u.faction === 'enemy').length;
  report('敌方 AI 采矿/生产单位', enemyUnits >= 2, `敌方单位=${enemyUnits}`);

  // --- T10 战斗：清场后验证己方坦克 vs 敌步兵 ---
  const foeId = await g(() => {
    const game = window.__game;
    // 清场：排除 AI 进攻波干扰，专注验证交战机制
    for (const u of game.units.filter((u) => u.faction === 'enemy')) u.takeDamage(999999);
    const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
    game.spawnUnit('lightTank', 'player', cy.x + 150, cy.y);
    const foe = game.spawnUnit('infantry', 'enemy', cy.x + 260, cy.y);
    return foe.id;
  });
  await sleep(7000);
  const foeAlive = await g((id) => {
    const game = window.__game;
    const u = game.units.find((u) => u.id === id);
    return !!u && u.alive;
  }, foeId);
  report('自动索敌并交火消灭敌人', foeAlive === false, `目标存活=${foeAlive}`);
  await shot('06-combat');

  // --- T11 战争迷雾 ---
  const fogCheck = await g(() => {
    const game = window.__game;
    const enemyCY = game.buildings.find((b) => b.faction === 'enemy' && b.kind === 'constructionYard');
    const enemyHv = game.units.find((u) => u.faction === 'enemy');
    return {
      cyExplored: game.fog.isExploredWorld(enemyCY.x, enemyCY.y),
      hvVisible: enemyHv ? enemyHv.visible : 'none',
    };
  });
  report('战争迷雾遮蔽未探索区域', fogCheck.cyExplored === false && fogCheck.hvVisible === false, JSON.stringify(fogCheck));

  // --- T12 胜利条件 ---
  await g(() => {
    const game = window.__game;
    const cy = game.buildings.find((b) => b.faction === 'enemy' && b.kind === 'constructionYard');
    cy.takeDamage(999999);
  });
  await sleep(800);
  st = await state();
  const overlayWin = await g(() => document.querySelector('#overlay')?.style.display === 'flex');
  report('摧毁敌方指挥中心获胜', st.gameOver === 'victory' && overlayWin, `gameOver=${st.gameOver}`);
  await shot('07-victory');

  // --- T13 失败条件（重开一局） ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive(), { timeout: 15000 });
  await sleep(1000);
  await g(() => {
    const game = window.__game;
    const mcv = game.units.find((u) => u.kind === 'mcv');
    game.selected = [mcv];
    game.deployMCV();
    const cy = game.buildings.find((b) => b.faction === 'player' && b.kind === 'constructionYard');
    cy.takeDamage(999999);
  });
  await sleep(800);
  st = await state();
  const overlayLose = await g(() => document.querySelector('#overlay')?.style.display === 'flex');
  report('己方指挥中心被毁判负', st.gameOver === 'defeat' && overlayLose, `gameOver=${st.gameOver}`);
  await shot('08-defeat');

  report('全程无 JS 运行时错误', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 400) || '无报错');

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n==== ${results.length - fails}/${results.length} 项通过 ====`);
  await browser.close();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('冒烟测试异常中断:', e);
  process.exit(2);
});
