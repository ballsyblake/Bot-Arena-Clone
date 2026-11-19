// Node checks for the battle simulation. Run: node tests/sim.test.mjs
import { ARENAS, TEAM_COLORS } from '../js/data.js';
import { botStats, enemyBuild, buildIssue } from '../js/bot.js';
import { runHeadless } from '../js/sim.js';

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const unit = (b, tactic = 'rush') => ({ st: botStats(b), tactic, color: TEAM_COLORS[0], name: 'B1' });
const foes = (a) => a.team.map((s) => ({ st: botStats(enemyBuild(s), s.hm), tactic: 'rush', color: '#f00', name: 'R' }));
const starter = { frame: { key: 'skiff', lvl: 1 }, drive: { key: 'rollers', lvl: 1 }, weapons: [{ key: 'rivet', lvl: 1 }], plate: null, module: null };

check(buildIssue(starter) === null, 'starter bot is valid');
check(buildIssue({ ...starter, plate: { key: 'bastion', lvl: 1 } }) === 'Overweight', 'Bastion is too heavy for a Skiff');

const a = runHeadless({ teams: [[unit(starter)], foes(ARENAS[0])], layout: 'pit', seed: 42 });
const b = runHeadless({ teams: [[unit(starter)], foes(ARENAS[0])], layout: 'pit', seed: 42 });
check(a.winner === b.winner && a.t === b.t, 'same seed gives the same fight');

for (const tactic of ['rush', 'range', 'flank']) {
  let wins = 0;
  for (let s = 1; s <= 20; s++) {
    const r = runHeadless({ teams: [[unit(starter, tactic)], foes(ARENAS[0])], layout: ARENAS[0].layout, seed: s, portrait: s % 2 === 0 });
    if (r.winner === 0) wins++;
  }
  check(wins >= 16, `arena 1 is winnable with the free starter bot (${tactic}): ${wins}/20`);
}

let ends = 0;
for (let i = 0; i < ARENAS.length; i++) {
  const r = runHeadless({ teams: [[unit(starter)], foes(ARENAS[i])], layout: ARENAS[i].layout, seed: 3 });
  if (r.over) ends++;
}
check(ends === ARENAS.length, 'every arena fight ends');
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
