// Balance check: can a player who has won every earlier arena once (no replays) afford a team
// that beats the next one? Prints the best win rate found and the share of random teams that win.
// Run: node tools/balance.mjs
import { ARENAS, START_CREDITS } from '../js/data.js';
import { rng, budgetTeam, winRate, describe } from './lib.mjs';

const starter = { b: { frame: { key: 'skiff', lvl: 1 }, drive: { key: 'rollers', lvl: 1 }, weapons: [{ key: 'rivet', lvl: 1 }], plate: null, module: null }, tactic: 'rush' };
console.log('Arena 1, free starter bot only:', winRate([starter], ARENAS[0], 40));

let budget = START_CREDITS + 240;
for (let a = 0; a < ARENAS.length; a++) {
  const arena = ARENAS[a];
  const rnd = rng(9000 + a);
  const pool = [];
  for (let i = 0; i < 400; i++) { const c = budgetTeam(budget, rnd); if (c) pool.push(c); }
  const all = pool.map((c) => ({ ...c, q: winRate(c.team, arena, 6) })).sort((x, y) => y.q - x.q);
  const share = Math.round((100 * all.filter((c) => c.q >= 0.5).length) / Math.max(1, all.length));
  let best = null;
  for (const c of all.slice(0, 8)) {
    const q = winRate(c.team, arena, 30, 1, 7000);
    if (!best || q > best.q) best = { ...c, q };
  }
  console.log(`${String(a + 1).padStart(2)} ${arena.name.padEnd(14)} budget ${String(budget).padStart(5)}  best ${Math.round(best.q * 100)}%  random-teams-that-win ${share}%  ${best.team.map(describe).join(' | ')}`);
  budget += arena.reward;
}
