// Checks for the expected places: each report's numbers come from its own luck, and the data adds up.
import { readFileSync } from "fs";
import { runAll } from "../site/engine/run.js";
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

for (const k of ["oxf", "cam"]) {
  const ds = JSON.parse(readFileSync(new URL(`./fixture_${k}.json`, import.meta.url)));
  const R = runAll(ds, { runs: 1000, nSamples: 200 });
  const T = R.teamsBasic, spk = (i) => T[i].spkTotal ?? 0;
  const rank = (rows, val) => { const o = rows.slice().sort((a, b) => val(b) - val(a) || spk(b.i) - spk(a.i) || a.i - b.i); return new Map(o.map((t, j) => [t.i, j + 1])); };
  console.log(`== ${k}`);
  const D = R.seat.teams.filter((t) => t.exp), Rm = R.room.teams, O = R.model.teams;
  const mBy = new Map(O.map((t) => [t.i, t]));
  // each report's adjusted points use its own luck only
  ok(D.every((t) => Math.abs(t.exp.adjPts - (T[t.i].pts - t.diff * t.played)) < 1e-9), `${k}: draw = points − seat-audit luck, all ${D.length} teams (no model)`);
  const rate = R.meta.expected.roomRate;
  ok(rate > 0.01 && rate < 0.04, `${k}: room conversion rate is sensible (${rate.toFixed(4)} points per 1% harder)`);
  ok(Rm.every((t) => Math.abs(t.exp.adjPts - (T[t.i].pts + rate * t.hardPct.reduce((a, h) => a + (h || 0), 0))) < 1e-9), `${k}: room = points + rate × the room audit's own difficulties, all ${Rm.length} teams`);
  // every overtake is explained by the numbers shown in that report's table (allowing for display rounding)
  const spread = (key) => new Map(R.meta.expected.order[key].map((o) => [o.i, o.spread]));
  const sD = spread("draw"), sR = spread("room"), sL = spread("luck");
  const flipsOk = (rows, shown, tol) => { let bad = 0, n = 0; for (const a of rows) for (const b of rows) { if (!(a.real < b.real && a.exp > b.exp)) continue; n++; if (shown(b) < shown(a) - tol) bad++; } return [bad, n]; };
  const [b1, n1] = flipsOk(D.map((t) => ({ real: parseInt(T[t.i].rank, 10), exp: t.exp.rank, v: T[t.i].pts + sD.get(t.i) - +t.diff.toFixed(3) * t.played })), (x) => x.v, 2 * 0.0005 * 5);
  ok(b1 === 0, `${k}: draw: all ${n1} overtakes explained by the seat scores shown`);
  const [b2, n2] = flipsOk(Rm.map((t) => ({ real: t.exp.real, exp: t.exp.rank, v: t.pts + sR.get(t.i) + rate * +t.meanPct.toFixed(1) * R.meta.rounds })), (x) => x.v, 2 * rate * 0.05 * R.meta.rounds);
  ok(b2 === 0, `${k}: room: all ${n2} overtakes explained by the difficulty % shown`);
  const [b3, n3] = flipsOk(O.map((t) => ({ real: t.exp.real, exp: t.exp.rank, v: t.pts + sL.get(t.i) - +t.total.toFixed(2) })), (x) => x.v, 0.01);
  ok(b3 === 0, `${k}: overall: all ${n3} overtakes explained by the total luck shown`);
  // clear-move flags
  for (const [name, rows, realOf] of [["draw", D, (t) => parseInt(T[t.i].rank, 10)], ["room", Rm, (t) => t.exp.real], ["overall", O, (t) => t.exp.real]]) {
    ok(rows.every((t) => t.exp.clear === (realOf(t) < t.exp.range80[0] || realOf(t) > t.exp.range80[1])), `${name}: "clear move" flag = real place outside the 80% range (${rows.filter((t) => t.exp.clear).length} clear)`);
    ok(rows.every((t) => !t.exp.ownRange80 || (t.exp.ownRank >= t.exp.ownRange80[0] - 1 && t.exp.ownRank <= t.exp.ownRange80[1] + 1)), `${name}: own-luck place sits inside (or next to) its own 80% range`);
    ok(rows.every((t) => !t.exp.ownRange80 || t.exp.ownClear === (realOf(t) < t.exp.ownRange80[0] || realOf(t) > t.exp.ownRange80[1])), `${name}: own-luck "clear" flag = real place outside its range (${rows.filter((t) => t.exp.ownClear).length} clear)`);
  }
  // room: clear moves go the way the room audit label says
  const rc = Rm.filter((t) => t.exp.clear && t.cls !== "Fair"), rcGood = rc.filter((t) => (t.cls === "Hard" ? t.exp.rank < t.exp.real : t.exp.rank > t.exp.real)).length;
  ok(rc.length === 0 || rcGood === rc.length, `${k}: room: clear moves of hard/soft teams all go the label's way (${rcGood}/${rc.length})`);
  ok(O.every((t) => Math.abs(t.exp.adjPts - (T[t.i].pts - t.total)) < 1e-9), `${k}: overall = points − total luck, all ${O.length} teams`);
  // ranks follow adjusted points (speaks break ties)
  for (const [name, rows, ord] of [["draw", D, R.meta.expected.order.draw], ["room", Rm, R.meta.expected.order.room], ["overall", O, R.meta.expected.order.luck]]) {
    const want = rank(ord.map((o) => ({ i: o.i, a: o.adj + o.spread })), (t) => t.a);
    ok(rows.every((t) => t.exp.rank === want.get(t.i)), `${k}: ${name} expected places = whole-tab ranking of adjusted points`);
    ok(rows.every((t) => t.exp.range80[0] <= t.exp.range80[1]), `${k}: ${name} ranges well formed`);
  }
  // with zero luck you get the real tab back
  ok(O.every((t) => t.exp.real === parseInt(T[t.i].rank, 10)) && Rm.every((t) => t.exp.real === parseInt(T[t.i].rank, 10)), `${k}: room and overall expected places use the real tab's scale`);
  const ordAll = R.meta.expected.order.luck; ok(ordAll.every((o) => !o.analysed || true) && ordAll.filter((o) => !o.analysed).every((o) => Math.abs(o.adj - T[o.i].pts) < 1e-9), `${k}: teams that missed rounds keep their real points (${ordAll.filter((o) => !o.analysed).length} teams)`);
  const zero = rank(ordAll.map((o) => ({ i: o.i })), (t) => T[t.i].pts);
  ok(ordAll.every((o) => zero.get(o.i) === o.real), `${k}: zero luck reproduces the whole real tab (${ordAll.length} teams)`);
  const realD = rank(D, (t) => T[t.i].pts);
  ok(D.every((t) => realD.get(t.i) === parseInt(T[t.i].rank, 10)), `${k}: zero seat luck reproduces the real tab for all ${D.length} teams`);
  // the three are genuinely different
  const rBy = new Map(Rm.map((t) => [t.i, t.exp.rank])), dBy = new Map(D.map((t) => [t.i, t.exp.rank]));
  ok(O.filter((t) => t.exp.rank !== rBy.get(t.i)).length > O.length / 4, `${k}: room and overall expected places differ for ${O.filter((t) => t.exp.rank !== rBy.get(t.i)).length} teams`);
  ok(O.filter((t) => t.exp.rank !== dBy.get(t.i)).length > O.length / 4, `${k}: draw and overall expected places differ for ${O.filter((t) => t.exp.rank !== dBy.get(t.i)).length} teams`);
  // own-luck-only places always move the way the team's own luck says (or not at all)
  for (const [name, rows] of [["draw", D], ["room", Rm], ["overall", O]]) {
    const badOwn = rows.filter((t) => { const g = t.exp.adjPts - T[t.i].pts, d = t.exp.real - t.exp.ownRank; return d !== 0 && Math.sign(d) !== Math.sign(g); }).length;
    ok(badOwn === 0, `${k}: ${name} own-luck-only places never move against the team's own luck (${badOwn} exceptions)`);
    const cliffs = rows.filter((t) => Math.abs(t.exp.adjPts - T[t.i].pts) < 0.1 && Math.abs(t.exp.ownRank - t.exp.real) >= 5).length;
    ok(cliffs === 0, `${k}: ${name} tiny luck (<0.1 pts) never moves a team 5+ places on its own (${cliffs})`);
  }
  // moves agree with the labels
  const cls = O.filter((t) => Math.abs(t.total) > 0.5);
  const agree = cls.filter((t) => Math.sign(t.exp.rank - t.exp.real) === Math.sign(t.total)).length;
  ok(agree / cls.length >= 0.85, `${k}: lucky/unlucky teams move the way their label says: ${agree}/${cls.length}`);
  const dl = D.filter((t) => t.cls !== "Neutral" && t.cls !== "DNC"), dAgree = dl.filter((t) => Math.sign(t.exp.rank - parseInt(T[t.i].rank, 10)) === Math.sign(t.diff)).length;
  ok(dAgree / dl.length >= 0.8, `${k}: draw lucky/unlucky teams move the way their label says: ${dAgree}/${dl.length}`);
  const rl = Rm.filter((t) => t.cls !== "Fair"), rlGood = rl.filter((t) => (t.cls === "Hard" ? t.exp.rank < t.exp.real : t.exp.rank > t.exp.real)).length;
  ok(rlGood / rl.length >= 0.8, `${k}: room hard/soft teams move the way their label says: ${rlGood}/${rl.length}`);
  // sanity on the range and break share
  const signed = median(O.map((t) => t.exp.meanPlace - t.exp.rank));
  ok(Math.abs(signed) <= 1, `${k}: uncertainty samples aren't biased up or down vs the point estimate (median shift ${signed.toFixed(2)} places)`);
  const inside = O.filter((t) => t.exp.rank >= t.exp.range80[0] && t.exp.rank <= t.exp.range80[1]).length;
  ok(inside >= 0.95 * O.length, `${k}: expected place sits inside its own 80% range for ${inside}/${O.length} teams`);
  const sumBreak = O.reduce((a, t) => a + t.exp.pBreak, 0);
  ok(sumBreak <= R.sim.breakSize + 1e-6 && sumBreak > R.sim.breakSize - 1, `${k}: break chances without luck add up to the ${R.sim.breakSize} break places (${sumBreak.toFixed(3)})`);
}
console.log(fails ? `${fails} FAILED` : "all expected-place checks passed");
process.exit(fails ? 1 : 0);
