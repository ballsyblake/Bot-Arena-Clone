// Balance check: can a player who has won every earlier arena afford a team that beats the next one?
// Run: node tools/balance.mjs
import { ARENAS, FRAMES, DRIVES, WEAPONS, PLATES, MODULES, BAY_COST, START_CREDITS, upgradeCost, TEAM_COLORS } from '../js/data.js';
import { botStats, buildIssue, enemyBuild } from '../js/bot.js';
import { runHeadless } from '../js/sim.js';

const keys = (o) => Object.keys(o);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const partCost = (cat, defs, key, lvl) => {
  let c = defs[key].cost;
  for (let l = 1; l < lvl; l++) c += upgradeCost(cat, key, l);
  return c;
};

function randomBuild(maxLvl) {
  const lv = () => 1 + Math.floor(rnd() * maxLvl);
  const f = pick(keys(FRAMES));
  const b = {
    frame: { key: f, lvl: lv() }, drive: { key: pick(keys(DRIVES)), lvl: lv() },
    weapons: Array.from({ length: 1 + Math.floor(rnd() * FRAMES[f].slots) }, () => ({ key: pick(keys(WEAPONS)), lvl: lv() })),
    plate: rnd() < 0.75 ? { key: pick(keys(PLATES)), lvl: lv() } : null,
    module: rnd() < 0.4 ? { key: pick(keys(MODULES)), lvl: lv() } : null,
  };
  return b;
}
function buildCost(b) {
  let c = partCost('frame', FRAMES, b.frame.key, b.frame.lvl) + partCost('drive', DRIVES, b.drive.key, b.drive.lvl);
  for (const w of b.weapons) c += partCost('weapon', WEAPONS, w.key, w.lvl);
  if (b.plate) c += partCost('plate', PLATES, b.plate.key, b.plate.lvl);
  if (b.module) c += partCost('module', MODULES, b.module.key, b.module.lvl);
  return c;
}
const tactics = ['rush', 'range', 'flank'];

// Spend a budget at random but sensibly: buy bays, fill each bot with affordable parts, then upgrade.
function budgetTeam(budget) {
  const n = 1 + Math.floor(rnd() * 3);
  let left = budget - BAY_COST.slice(0, n).reduce((x, y) => x + y, 0);
  if (left < 0) return null;
  const share = left / n;
  const team = [];
  const afford = (defs, max) => keys(defs).filter((k) => defs[k].cost <= max);
  for (let k = 0; k < n; k++) {
    let m = k === n - 1 ? left : share * (0.7 + rnd() * 0.6);
    const fr = afford(FRAMES, m * 0.6); if (!fr.length) return null;
    const f = pick(fr); m -= FRAMES[f].cost; left -= FRAMES[f].cost;
    const dr = afford(DRIVES, m * 0.4); if (!dr.length) return null;
    const d = pick(dr); m -= DRIVES[d].cost; left -= DRIVES[d].cost;
    const b = { frame: { key: f, lvl: 1 }, drive: { key: d, lvl: 1 }, weapons: [], plate: null, module: null };
    for (let s = 0; s < FRAMES[f].slots; s++) {
      const wp = afford(WEAPONS, m * (s === 0 ? 0.8 : 0.5)); if (!wp.length) break;
      const w = pick(wp); b.weapons.push({ key: w, lvl: 1 }); m -= WEAPONS[w].cost; left -= WEAPONS[w].cost;
      if (buildIssue(b)) { b.weapons.pop(); m += WEAPONS[w].cost; left += WEAPONS[w].cost; break; }
    }
    if (!b.weapons.length) return null;
    const pl = afford(PLATES, m * 0.8);
    if (pl.length && rnd() < 0.85) { const p = pick(pl); b.plate = { key: p, lvl: 1 }; if (buildIssue(b)) b.plate = null; else { m -= PLATES[p].cost; left -= PLATES[p].cost; } }
    const mo = afford(MODULES, m);
    if (mo.length && rnd() < 0.5) { const p = pick(mo); b.module = { key: p, lvl: 1 }; if (buildIssue(b)) b.module = null; else { left -= MODULES[p].cost; } }
    team.push({ b, tactic: pick(tactics) });
  }
  // spend what is left on random upgrades
  for (let tries = 0; tries < 30; tries++) {
    const t = pick(team).b;
    const slots = [['frame', FRAMES, t.frame], ['drive', DRIVES, t.drive], ...t.weapons.map((w) => ['weapon', WEAPONS, w])];
    if (t.plate) slots.push(['plate', PLATES, t.plate]);
    if (t.module) slots.push(['module', MODULES, t.module]);
    const [cat, , part] = pick(slots);
    if (part.lvl >= 3) continue;
    const c = upgradeCost(cat, part.key, part.lvl);
    if (c > left) continue;
    left -= c; part.lvl++;
  }
  for (const t of team) if (buildIssue(t.b)) return null;
  return { team, cost: budget - left };
}

function winRate(team, arena, n) {
  let w = 0;
  const enemy = arena.team.map((s, i) => ({ st: botStats(enemyBuild(s), s.hm), tactic: tactics[i % 3], name: 'E', color: '#f00' }));
  for (let s = 0; s < n; s++) {
    const r = runHeadless({ teams: [team, enemy], layout: arena.layout, seed: 1000 + s, portrait: s % 2 === 1 });
    if (r.winner === 0) w++;
  }
  return w / n;
}
const unit = (b, tactic, i) => ({ st: botStats(b), tactic, name: 'P', color: TEAM_COLORS[i] });

const starter = { frame: { key: 'skiff', lvl: 1 }, drive: { key: 'rollers', lvl: 1 }, weapons: [{ key: 'rivet', lvl: 1 }], plate: null, module: null };
console.log('Arena 1, starter only (rush):', winRate([unit(starter, 'rush', 0)], ARENAS[0], 40));
console.log('Arena 1, starter + tin:', winRate([unit({ ...starter, plate: { key: 'tin', lvl: 1 } }, 'rush', 0)], ARENAS[0], 40));

let budget = START_CREDITS + 240;
const results = [];
for (let a = 0; a < ARENAS.length; a++) {
  const arena = ARENAS[a];
  const maxLvl = a < 2 ? 2 : 3;
  let best = null;
  const cands = [];
  for (let i = 0; i < 600; i++) {
    const c = budgetTeam(budget);
    if (c) cands.push(c);
  }
  const all = cands.map((c) => ({ ...c, q: winRate(c.team.map((t, i) => unit(t.b, t.tactic, i)), arena, 6) }))
    .sort((x, y) => y.q - x.q);
  const share = Math.round((100 * all.filter((c) => c.q >= 0.5).length) / Math.max(1, all.length));
  const scored = all.slice(0, 6);
  for (const c of scored) {
    const q = winRate(c.team.map((t, i) => unit(t.b, t.tactic, i)), arena, 30);
    if (!best || q > best.q) best = { ...c, q };
  }
  const desc = best ? best.team.map((t) => `${t.b.frame.key}/${t.b.drive.key}/${t.b.weapons.map((w) => w.key + w.lvl).join('+')}/${t.b.plate ? t.b.plate.key : '-'}/${t.b.module ? t.b.module.key : '-'} ${t.tactic}`).join(' | ') : 'none';
  results.push(`${a + 1} ${arena.name.padEnd(14)} budget ${String(budget).padStart(5)}  cands ${String(cands.length).padStart(4)}  best ${best ? Math.round(best.q * 100) : 0}%  random-builds-that-win ${share}%  cost ${best ? best.cost : 0}  ${desc}`);
  console.log(results[results.length - 1]);
  budget += arena.reward;
}
