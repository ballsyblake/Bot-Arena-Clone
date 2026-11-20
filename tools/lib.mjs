// Shared helpers for the balance and arena-generation tools (Node only).
import { FRAMES, DRIVES, WEAPONS, PLATES, MODULES, BAY_COST, upgradeCost, TEAM_COLORS } from '../js/data.js';
import { botStats, buildIssue, enemyBuild, enemyTactic } from '../js/bot.js';
import { runHeadless } from '../js/sim.js';

export const keys = (o) => Object.keys(o);
export function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
export const DEFS = { frame: FRAMES, drive: DRIVES, weapon: WEAPONS, plate: PLATES, module: MODULES };
export function partCost(cat, key, lvl) {
  let c = DEFS[cat][key].cost;
  for (let l = 1; l < lvl; l++) c += upgradeCost(cat, key, l);
  return c;
}
export function buildCost(b) {
  let c = partCost('frame', b.frame.key, b.frame.lvl) + partCost('drive', b.drive.key, b.drive.lvl);
  for (const w of b.weapons) c += partCost('weapon', w.key, w.lvl);
  if (b.plate) c += partCost('plate', b.plate.key, b.plate.lvl);
  if (b.module) c += partCost('module', b.module.key, b.module.lvl);
  return c;
}
export const TACTICS = ['rush', 'range', 'flank'];

// A random but sensible player team that fits a budget: bays, parts, then upgrades.
export function budgetTeam(budget, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
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
    if (mo.length && rnd() < 0.5) { const p = pick(mo); b.module = { key: p, lvl: 1 }; if (buildIssue(b)) b.module = null; else left -= MODULES[p].cost; }
    team.push({ b, tactic: pick(TACTICS) });
  }
  for (let tries = 0; tries < 60; tries++) {
    const t = pick(team).b;
    const slots = [['frame', t.frame], ['drive', t.drive], ...t.weapons.map((w) => ['weapon', w])];
    if (t.plate) slots.push(['plate', t.plate]);
    if (t.module) slots.push(['module', t.module]);
    const [cat, part] = pick(slots);
    if (part.lvl >= 3) continue;
    const c = upgradeCost(cat, part.key, part.lvl);
    if (c > left) continue;
    left -= c; part.lvl++;
  }
  for (const t of team) if (buildIssue(t.b)) return null;
  return { team, cost: budget - left };
}

export const playerUnits = (team) => team.map((t, i) => ({ st: botStats(t.b), tactic: t.tactic, name: 'P', color: TEAM_COLORS[i] }));
export const enemyUnitsSim = (arena, hmScale = 1) =>
  arena.team.map((s, i) => ({ st: botStats(enemyBuild(s), (s.hm || 1) * hmScale), tactic: enemyTactic(s, i), name: 'E', color: '#f00' }));

export function winRate(team, arena, n, hmScale = 1, seed0 = 1000) {
  let w = 0;
  const enemy = enemyUnitsSim(arena, hmScale);
  const mine = playerUnits(team);
  for (let s = 0; s < n; s++) {
    const r = runHeadless({ teams: [mine, enemy], layout: arena.layout, seed: seed0 + s, portrait: s % 2 === 1, smart: [false, !!arena.smart] });
    if (r.winner === 0) w++;
  }
  return w / n;
}
export const describe = (t) => `${t.b.frame.key}${t.b.frame.lvl}/${t.b.drive.key}/${t.b.weapons.map((w) => w.key + w.lvl).join('+')}/${t.b.plate ? t.b.plate.key + t.b.plate.lvl : '-'}/${t.b.module ? t.b.module.key : '-'} ${t.tactic}`;
