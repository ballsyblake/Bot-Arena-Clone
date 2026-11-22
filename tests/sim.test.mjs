// Node checks for the battle simulation. Run: node tests/sim.test.mjs
import { ARENAS, TEAM_COLORS } from '../js/data.js';
import { botStats, enemyBuild, buildIssue } from '../js/bot.js';
import { runHeadless } from '../js/sim.js';
import { encodeTeam, decodeTeam } from '../js/duel.js';

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
// duel links
const dt = [{ build: { frame: { key: 'warden', lvl: 2 }, drive: { key: 'treads', lvl: 1 }, weapons: [{ key: 'arc', lvl: 1 }, { key: 'rivet', lvl: 3 }], plate: { key: 'steel', lvl: 1 }, module: null }, tactic: 'range' },
  { build: { frame: { key: 'skiff', lvl: 1 }, drive: { key: 'hover', lvl: 1 }, weapons: [{ key: 'grinder', lvl: 1 }], plate: null, module: { key: 'booster', lvl: 1 } }, tactic: 'rush' }];
const code = encodeTeam('Blake <b>', dt);
const back = decodeTeam(code);
check(!back.error && JSON.stringify(back.team) === JSON.stringify(dt), 'duel link round-trips a team');
check(back.name === 'Blake b', 'duel link strips unsafe characters from names');
check(decodeTeam('1~x~51.43.73:73:73.43.43.0').error === 'Team is over the duel budget', 'duel link over budget is rejected');
check(!!decodeTeam('1~x~11.11.99.0.0.0').error, 'duel link with an unknown part is rejected');
check(!!decodeTeam('1~x~11.11.51.44.0.0').error, 'duel link with a level above 3 is rejected');
check(!!decodeTeam('1~x~11.11.51:51.0.0.0').error, 'duel link with too many weapons for the frame is rejected');
check(!!decodeTeam('1~x~11.11.11.41.0.0').error, 'duel link with an overweight bot is rejected');
check(!!decodeTeam('%E0%A4%A').error && !!decodeTeam('').error, 'garbage duel links are rejected');

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
