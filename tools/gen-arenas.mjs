// Builds every arena's enemy team from a budget and a theme, then tunes each team's toughness
// (hm, a hit-point multiplier) by simulation so a well-built player team wins about as often as
// the target says. Writes js/arenas.js.   Run: node tools/gen-arenas.mjs
import { writeFileSync } from 'node:fs';
import { FRAMES, DRIVES, WEAPONS, PLATES, MODULES, START_CREDITS } from '../js/data.js';
import { buildIssue, enemyBuild } from '../js/bot.js';
import { rng, keys, partCost, budgetTeam, winRate, describe } from './lib.mjs';

export const LEAGUES = ['Scrap League', 'Iron League', 'Volt League', 'Crown League'];

// name, layout, reward, theme, target win rate for a strong player team
const PLAN = [
  ['Rust Pit', 'pit', 200], ['Twin Posts', 'posts', 280],
  ['Crosscut', 'cross', 360, 'mixed', 0.98], ['Scrap Maze', 'maze', 460, 'brawl', 0.95], ['The Junk King', 'scrap', 650, 'tank', 0.9, 'boss'],
  ['Pillar Ring', 'ring', 720, 'snipe', 0.85], ['Bunker Line', 'bunker', 860, 'mixed', 0.82], ['Hammer Hall', 'cross', 1000, 'brawl', 0.8],
  ['Gridlock', 'grid', 1150, 'swarm', 0.78], ['Iron Matron', 'bunker', 1500, 'tank', 0.72, 'boss'],
  ['Volt Garden', 'ring', 1500, 'beam', 0.76], ['Two Lanes', 'lanes', 1700, 'snipe', 0.74], ['Spark Yard', 'scrap', 1900, 'mixed', 0.72],
  ['Static Maze', 'maze', 2100, 'swarm', 0.7], ['Thunderhead', 'grid', 2700, 'beam', 0.64, 'boss'],
  ['Iron Court', 'cross', 2600, 'tank', 0.68], ['Long Lanes', 'lanes', 2900, 'snipe', 0.66], ['Crown Pits', 'posts', 3200, 'brawl', 0.64],
  ['Last Gate', 'bunker', 3500, 'mixed', 0.62], ['Grand Foundry', 'scrap', 5000, 'mixed', 0.55, 'boss'],
];
const THEMES = {
  mixed: { w: ['rivet', 'scatter', 'arc', 'lobber', 'swarm', 'rail', 'grinder'], d: ['strider', 'treads', 'hover', 'rollers'], m: ['patch', 'barrier', 'overclock', 'booster'] },
  brawl: { w: ['grinder', 'scatter', 'rivet'], d: ['strider', 'hover', 'rollers'], m: ['booster', 'patch'] },
  snipe: { w: ['rail', 'lobber', 'arc', 'rivet'], d: ['strider', 'treads', 'rollers'], m: ['overclock', 'barrier'] },
  tank: { w: ['scatter', 'lobber', 'arc', 'rivet'], d: ['treads', 'rollers'], m: ['patch', 'barrier'] },
  swarm: { w: ['swarm', 'scatter', 'rivet'], d: ['hover', 'strider', 'rollers'], m: ['overclock', 'booster'] },
  beam: { w: ['arc', 'rivet', 'scatter'], d: ['strider', 'hover', 'rollers'], m: ['barrier', 'overclock'] },
};
const HAND = [
  [{ f: 'skiff', d: 'rollers', w: ['rivet'], p: null, m: null, lv: 1, hm: 0.7 }],
  [{ f: 'skiff', d: 'rollers', w: ['rivet'], p: null, m: null, lv: 1, hm: 0.65 }, { f: 'skiff', d: 'rollers', w: ['grinder'], p: null, m: null, lv: 1, hm: 0.65 }],
];

const specCost = (s) => {
  const L = s.lv;
  return partCost('frame', s.f, L) + partCost('drive', s.d, L) + s.w.reduce((x, w) => x + partCost('weapon', w, L), 0)
    + (s.p ? partCost('plate', s.p, L) : 0) + (s.m ? partCost('module', s.m, L) : 0);
};
const fits = (s) => !buildIssue(enemyBuild(s));
const byCost = (defs) => keys(defs).sort((a, b) => defs[a].cost - defs[b].cost);

function makeBot(money, theme, big, rnd) {
  const T = THEMES[theme];
  const pickTop = (list) => list[Math.max(0, list.length - 1 - Math.floor(rnd() * Math.min(2, list.length)))];
  let left = money;
  const fr = byCost(FRAMES).filter((k) => FRAMES[k].cost <= money * (big ? 0.45 : 0.35));
  const f = fr.length ? pickTop(fr) : 'skiff';
  left -= FRAMES[f].cost;
  const s = { f, d: 'rollers', w: [], p: null, m: null, lv: 1, hm: 1 };
  // weapons first so the theme shows
  const slots = FRAMES[f].slots;
  for (let i = 0; i < slots; i++) {
    const cap = (left * 0.6) / (slots - i);
    const ok = T.w.filter((k) => WEAPONS[k].cost <= Math.max(cap, 70)).sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost)
      .filter((k) => fits({ ...s, w: [...s.w, k] }));
    if (!ok.length) break;
    const w = pickTop(ok); s.w.push(w); left -= WEAPONS[w].cost;
  }
  if (!s.w.length) { s.w.push('rivet'); left -= WEAPONS.rivet.cost; }
  const d = T.d.find((k) => DRIVES[k].cost <= Math.max(60, left * 0.35) && fits({ ...s, d: k })) || 'rollers';
  s.d = d; left -= DRIVES[d].cost;
  const pl = byCost(PLATES).filter((k) => PLATES[k].cost <= left * 0.8 && fits({ ...s, p: k }));
  if (pl.length) { s.p = pl[pl.length - 1]; left -= PLATES[s.p].cost; }
  const mo = T.m.filter((k) => MODULES[k].cost <= left && fits({ ...s, m: k }));
  if (mo.length && rnd() < 0.8) { s.m = mo[Math.floor(rnd() * mo.length)]; }
  while (s.lv < 3 && specCost({ ...s, lv: s.lv + 1 }) <= money) s.lv++;
  return s;
}

function makeTeam(i, budget, theme, boss, rnd) {
  const n = i < 4 ? 2 : 3;
  if (boss) {
    const big = makeBot(budget * (n === 2 ? 0.65 : 0.55), theme, true, rnd);
    const rest = budget - specCost(big);
    return [big, ...Array.from({ length: n - 1 }, () => makeBot(rest / (n - 1), theme, false, rnd))];
  }
  return Array.from({ length: n }, () => makeBot(budget / n, theme, false, rnd));
}

const arenas = [];
let budget = START_CREDITS + 240;
const t0 = Date.now();
for (let i = 0; i < PLAN.length; i++) {
  const [name, layout, reward, theme, target, boss] = PLAN[i];
  const league = Math.floor(i / 5);
  const a = { name, layout, reward, league, boss: !!boss, smart: i >= 5 || !!boss, team: null };
  if (i < 2) {
    a.team = HAND[i];
  } else {
    const rnd = rng(1000 + i * 77);
    const k = 0.85 + 0.45 * (i / (PLAN.length - 1)) + (boss ? 0.1 : 0);
    a.team = makeTeam(i, budget * k, theme, boss, rnd);
    // player teams this budget could field
    const prnd = rng(5000 + i);
    const pool = [];
    for (let c = 0; c < 320; c++) { const t = budgetTeam(budget, prnd); if (t) pool.push(t); }
    const screened = pool.map((c) => ({ ...c, q: winRate(c.team, a, 4) })).sort((x, y) => y.q - x.q).slice(0, 10);
    const best = (hm) => Math.max(...screened.map((c) => winRate(c.team, a, 12, hm, 3000)));
    let lo = 0.5, hi = 2.6;
    for (let it = 0; it < 6; it++) { const mid = (lo + hi) / 2; if (best(mid) > target) lo = mid; else hi = mid; }
    const hm = Math.round(((lo + hi) / 2) * 100) / 100;
    a.team = a.team.map((s) => ({ ...s, hm }));
    const got = Math.max(...screened.map((c) => winRate(c.team, a, 12, 1, 3000)));
    console.log(`${String(i + 1).padStart(2)} ${name.padEnd(14)} budget ${String(budget).padStart(5)} enemy ${String(a.team.reduce((x, s) => x + specCost(s), 0)).padStart(5)} hm ${hm} best ${Math.round(got * 100)}% (target ${Math.round(target * 100)}%)  ${a.team.map((s) => `${s.f}/${s.d}/${s.w.join('+')}/${s.p || '-'}/${s.m || '-'} L${s.lv}`).join(' | ')}  [${Math.round((Date.now() - t0) / 1000)}s]`);
    if (hm >= 2.55 || hm <= 0.52) console.log('   WARNING: hm at search limit');
  }
  arenas.push(a);
  budget += reward;
}

const out = `// Generated by tools/gen-arenas.mjs. Edit PLAN there and re-run rather than editing by hand.
// Enemy spec: f frame, d drive, w weapons, p plating, m module, lv part level, hm hit-point multiplier.
export const LEAGUES = ${JSON.stringify(LEAGUES)};
export const ARENAS = [
${arenas.map((a) => '  ' + JSON.stringify(a)).join(',\n')},
];
`;
writeFileSync(new URL('../js/arenas.js', import.meta.url), out);
console.log('wrote js/arenas.js');
