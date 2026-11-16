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
  ok(Rm.every((t) => Math.abs(t.exp.adjPts - (T[t.i].pts - mBy.get(t.i).roomTot)) < 1e-9), `${k}: room = points − room luck, all ${Rm.length} teams`);
  ok(O.every((t) => Math.abs(t.exp.adjPts - (T[t.i].pts - t.total)) < 1e-9), `${k}: overall = points − total luck, all ${O.length} teams`);
  // ranks follow adjusted points (speaks break ties)
  for (const [name, rows] of [["draw", D], ["room", Rm], ["overall", O]]) {
    const want = rank(rows, (t) => t.exp.adjPts);
    ok(rows.every((t) => t.exp.rank === want.get(t.i)), `${k}: ${name} expected places = ranking of its adjusted points`);
    ok(rows.every((t) => t.exp.range80[0] <= t.exp.range80[1]), `${k}: ${name} ranges well formed`);
  }
  // with zero luck you get the real tab back
  const real = rank(O, (t) => T[t.i].pts);
  ok(O.every((t) => real.get(t.i) === t.tabPlace), `${k}: zero luck reproduces the real order of the ${O.length} full-attendance teams`);
  const realD = rank(D, (t) => T[t.i].pts);
  ok(D.every((t) => realD.get(t.i) === parseInt(T[t.i].rank, 10)), `${k}: zero seat luck reproduces the real tab for all ${D.length} teams`);
  // the three are genuinely different
  const rBy = new Map(Rm.map((t) => [t.i, t.exp.rank])), dBy = new Map(D.map((t) => [t.i, t.exp.rank]));
  ok(O.filter((t) => t.exp.rank !== rBy.get(t.i)).length > O.length / 4, `${k}: room and overall expected places differ for ${O.filter((t) => t.exp.rank !== rBy.get(t.i)).length} teams`);
  ok(O.filter((t) => t.exp.rank !== dBy.get(t.i)).length > O.length / 4, `${k}: draw and overall expected places differ for ${O.filter((t) => t.exp.rank !== dBy.get(t.i)).length} teams`);
  // moves agree with the labels
  const cls = O.filter((t) => Math.abs(t.total) > 0.5);
  const agree = cls.filter((t) => Math.sign(t.exp.rank - t.tabPlace) === Math.sign(t.total)).length;
  ok(agree / cls.length >= 0.85, `${k}: lucky/unlucky teams move the way their label says: ${agree}/${cls.length}`);
  const dl = D.filter((t) => t.cls !== "Neutral" && t.cls !== "DNC"), dAgree = dl.filter((t) => Math.sign(t.exp.rank - parseInt(T[t.i].rank, 10)) === Math.sign(t.diff)).length;
  ok(dAgree / dl.length >= 0.8, `${k}: draw lucky/unlucky teams move the way their label says: ${dAgree}/${dl.length}`);
  // sanity on the range and break share
  const signed = median(O.map((t) => t.exp.meanPlace - t.exp.rank));
  ok(Math.abs(signed) <= 1, `${k}: uncertainty samples aren't biased up or down vs the point estimate (median shift ${signed.toFixed(2)} places)`);
  const inside = O.filter((t) => t.exp.rank >= t.exp.range80[0] && t.exp.rank <= t.exp.range80[1]).length;
  ok(inside >= 0.95 * O.length, `${k}: expected place sits inside its own 80% range for ${inside}/${O.length} teams`);
  const sumBreak = O.reduce((a, t) => a + t.exp.pBreak, 0);
  ok(Math.abs(sumBreak - R.sim.breakSize) < 1e-6, `${k}: break chances without luck add up to the ${R.sim.breakSize} break places (${sumBreak.toFixed(3)})`);
}
console.log(fails ? `${fails} FAILED` : "all expected-place checks passed");
process.exit(fails ? 1 : 0);
