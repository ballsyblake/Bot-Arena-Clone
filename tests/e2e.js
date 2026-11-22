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

// Duel: desktop builds a team and sends a link; a phone opens it, builds its own team, fights and replies.
async function buildDuelTeam(p, tapOrClick) {
  await tapOrClick('[data-act=duelEdit]');
  await tapOrClick('[data-slot=frame]'); await tapOrClick('[data-act=buy][data-key=brick]');
  await tapOrClick('[data-act=close]');
  await tapOrClick('[data-slot=drive]'); await tapOrClick('[data-act=buy][data-key=rollers]');
  await tapOrClick('[data-act=close]');
  await tapOrClick('[data-slot="weapon:0"]'); await tapOrClick('[data-act=buy][data-key=scatter]');
  await tapOrClick('[data-act=close]');
  await tapOrClick('[data-slot=plate]'); await tapOrClick('[data-act=buy][data-key=steel]');
  await tapOrClick('[data-act=close]');
  await tapOrClick('.duelbar [data-act=tab]');
}

async function duel(br) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL);
  await p.click('text=Start');
  await p.click('[data-tab=duel]');
  await p.fill('#duelName', 'Tester <x>');
  const click = (sel) => p.click(sel);
  await buildDuelTeam(p, click);
  check((await p.evaluate(() => window.__boltyard.duel.credits)) === 4000 - 320 - 60 - 220 - 280, 'duel: parts paid from the 4000 duel budget');
  check((await p.evaluate(() => window.__boltyard.campaign.credits)) === 250, 'duel: campaign credits untouched');
  await p.click('[data-act=duelShare]');
  await p.waitForTimeout(300);
  const link = await p.evaluate(() => window.__lastShare);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check(/#duel=1~Tester-x~/.test(link) && clip === link, 'duel: challenge link copied (' + (link || '').length + ' chars)');
  await shot(p, 'x1-duel-desktop');
  check(errs.length === 0, 'duel desktop: no console errors ' + (errs.length ? JSON.stringify(errs) : ''));
  await ctx.close();

  const pc = await br.newContext({ ...devices['iPhone 13'] });
  const q = await pc.newPage();
  const qerrs = [];
  q.on('pageerror', (e) => qerrs.push(e.message));
  await q.goto(link);
  await q.tap('text=Start');
  check(await q.isVisible('.dcard.in'), 'duel phone: link opens the challenge card');
  check((await q.textContent('.dcard.in b')).includes('Tester x'), 'duel phone: challenger name shown, unsafe characters removed');
  check(await q.isDisabled('[data-act=duelfight]'), 'duel phone: must build a team before fighting');
  await buildDuelTeam(q, (sel) => q.tap(sel));
  await shot(q, 'x2-duel-phone');
  await q.tap('[data-act=duelfight]');
  await q.waitForTimeout(600);
  const pt = await enemyPoint(q);
  await q.touchscreen.tap(pt.x, pt.y);
  check((await q.evaluate(() => window.__boltyard.battle.focus[0] && window.__boltyard.battle.focus[0].id)) === pt.id, 'duel phone: tap to focus fire works in duels');
  await q.tap('#speedBtn'); await q.tap('#speedBtn');
  await waitResult(q);
  await shot(q, 'x3-duel-result');
  const rec = await q.evaluate(() => window.__boltyard.duel.record['Tester x']);
  check(rec && rec.w + rec.l === 1, 'duel phone: result recorded against the challenger');
  await q.tap('[data-act=duelReply]');
  await q.waitForTimeout(400);
  const reply = await q.evaluate(() => window.__lastShare);
  check(/#duel=1~anon~/.test(reply || ''), 'duel phone: reply link made from the phone team');
  // a tampered link: same team with every part bumped to level 3
  const bad = link.replace(/~[^~]+$/, '~51.43.73:73:73.43.43.0');
  await q.goto('about:blank');
  await q.goto(bad);
  await q.waitForTimeout(300);
  check((await q.textContent('#toast')) === 'Team is over the duel budget' && !(await q.isVisible('.dcard.in')), 'duel phone: over-budget link refused');
  check(qerrs.length === 0, 'duel phone: no console errors ' + (qerrs.length ? JSON.stringify(qerrs) : ''));
  await pc.close();
}

(async () => {
  const br = await chromium.launch();
  try { await desktop(br); await phone(br); await duel(br); }
  catch (e) { console.log('FAIL ' + e.message); failures++; }
  await br.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})();
