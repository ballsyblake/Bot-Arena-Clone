// Browser test with real mouse clicks (desktop) and touch taps (iPhone 13 emulation).
// Start a server first:  python3 -m http.server 8123
// Then run:              node tests/e2e.js [screenshot-dir]
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://localhost:8123/';
const OUT = process.argv[2] || null;
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };
const shot = async (p, name) => { if (OUT) await p.screenshot({ path: `${OUT}/${name}.png` }); };

// screen position of the first living enemy bot
async function enemyPoint(p) {
  return p.evaluate(() => {
    const g = window.__boltyard, b = g.battle, v = g.view;
    const e = b.bots.find((x) => x.team === 1 && x.alive);
    const r = document.querySelector('#arena').getBoundingClientRect();
    return { x: r.left + v.ox + e.x * v.scale, y: r.top + v.oy + e.y * v.scale, id: e.id };
  });
}
const credits = (p) => p.evaluate(() => window.__boltyard.state.credits);
const waitResult = (p) => p.waitForFunction(() => !document.querySelector('#result').classList.contains('hidden'), null, { timeout: 120000 });

async function desktop(br) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL);
  await p.click('text=Start');
  check((await credits(p)) === 250, 'desktop: starts with 250 credits');
  await shot(p, 'd1-garage');

  await p.click('[data-slot=plate]');
  await p.click('[data-act=buy][data-key=tin]');
  check((await credits(p)) === 170, 'desktop: buying Tin plating costs 80');
  await shot(p, 'd2-picker');
  await p.click('[data-act=close]');
  await p.click('[data-slot="weapon:0"]');
  await p.click('[data-act=upgrade]');
  const lvl = await p.evaluate(() => window.__boltyard.state.inv.find((x) => x.key === 'rivet').lvl);
  check(lvl === 2 && (await credits(p)) === 110, 'desktop: Rivet Gun upgraded to L2 for 60');
  await p.click('[data-act=close]');
  await p.click('[data-act=tactic][data-t=range]');
  check((await p.evaluate(() => window.__boltyard.state.bots[0].tactic)) === 'range', 'desktop: tactic set to Range');

  await p.click('[data-tab=arenas]');
  await shot(p, 'd3-arenas');
  const locked = await p.isDisabled('[data-act=fight][data-i="1"]');
  check(locked, 'desktop: arena 2 locked before arena 1 is won');
  await p.click('[data-act=fight][data-i="0"]');
  await p.waitForTimeout(400);
  const pt = await enemyPoint(p);
  await p.mouse.click(pt.x, pt.y);
  const focus = await p.evaluate(() => window.__boltyard.battle.focus[0] && window.__boltyard.battle.focus[0].id);
  check(focus === pt.id, 'desktop: mouse click on a foe sets focus fire');
  await p.waitForTimeout(1500);
  await shot(p, 'd4-battle');
  await p.click('#speedBtn'); await p.click('#speedBtn');
  check((await p.textContent('#speedBtn')) === '4x', 'desktop: speed button cycles to 4x');
  await waitResult(p);
  await shot(p, 'd5-result');
  const won = (await p.textContent('#result h2')) === 'VICTORY';
  check(won, 'desktop: arena 1 won with the starter bot plus Tin');
  check((await credits(p)) === 310, 'desktop: reward of 200 paid');
  await p.click('[data-act=leave]');

  await p.click('[data-tab=garage]');
  await p.click('[data-act=unlock][data-i="1"]');
  const bots = await p.evaluate(() => window.__boltyard.state.bots.length);
  check(bots === 2 && (await credits(p)) === 10, 'desktop: bay 2 unlocked for 300');
  // new bot is empty and sits out; picking a weapon first is blocked until a frame is fitted
  await p.click('[data-slot=drive]');
  check(await p.isVisible('#sheet .issue'), 'desktop: empty bot asks for a frame first');
  await p.click('[data-act=close]');

  await p.reload();
  check((await credits(p)) === 10 && (await p.evaluate(() => window.__boltyard.state.bots.length)) === 2, 'desktop: progress survives a reload');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'desktop: no sideways scroll');
  check(errs.length === 0, 'desktop: no console errors ' + (errs.length ? JSON.stringify(errs) : ''));
  await ctx.close();
}

async function phone(br) {
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL);
  await p.tap('text=Start');
  await shot(p, 'p1-garage');
  await p.tap('[data-slot=plate]');
  await p.tap('[data-act=buy][data-key=tin]');
  check((await credits(p)) === 170, 'phone: tap to buy Tin');
  await shot(p, 'p2-picker');
  await p.tap('[data-act=close]');
  await p.tap('[data-tab=arenas]');
  await shot(p, 'p3-arenas');
  await p.tap('[data-act=fight][data-i="0"]');
  await p.waitForTimeout(600);
  const portrait = await p.evaluate(() => window.__boltyard.battle.portrait);
  check(portrait, 'phone: arena turns portrait to fill the screen');
  const pt = await enemyPoint(p);
  await p.touchscreen.tap(pt.x, pt.y);
  const focus = await p.evaluate(() => window.__boltyard.battle.focus[0] && window.__boltyard.battle.focus[0].id);
  check(focus === pt.id, 'phone: tapping a foe sets focus fire');
  await p.waitForTimeout(1800);
  await shot(p, 'p4-battle');
  await p.tap('#speedBtn'); await p.tap('#speedBtn');
  await waitResult(p);
  await shot(p, 'p5-result');
  check((await p.textContent('#result h2')) === 'VICTORY', 'phone: arena 1 won');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'phone: no sideways scroll');
  check(errs.length === 0, 'phone: no console errors ' + (errs.length ? JSON.stringify(errs) : ''));
  await ctx.close();
}

(async () => {
  const br = await chromium.launch();
  try { await desktop(br); await phone(br); }
  catch (e) { console.log('FAIL ' + e.message); failures++; }
  await br.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})();
