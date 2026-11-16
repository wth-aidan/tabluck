// Compare the JS engine against today's Python outputs.
import fs from "fs";
import { prepare } from "../site/engine/prep.js";
import { seatAudit } from "../site/engine/seat.js";
import { roomAudit, billing } from "../site/engine/room.js";
import { luckModel } from "../site/engine/model.js";
import { simulate } from "../site/engine/sim.js";
import { holdout } from "../site/engine/model.js";

const MOT = {
  cam: [[1.43, 2.00, 1.10, 1.48], [2.00, 1.29, 1.43, 1.29], [1.62, 1.67, 0.95, 1.76], [1.00, 2.24, 1.19, 1.57], [1.29, 2.10, 1.24, 1.38]],
  oxf: [[1.82, 1.36, 1.58, 1.24], [1.27, 1.88, 1.24, 1.61], [1.45, 1.88, 0.82, 1.85], [1.58, 1.85, 1.24, 1.33], [1.73, 1.27, 1.55, 1.45]],
};
const pySeat = JSON.parse(fs.readFileSync(new URL("./expected/seat_audit.json", import.meta.url)));
const pyRoom = JSON.parse(fs.readFileSync(new URL("./expected/room_audit.json", import.meta.url)));
const pyS2 = JSON.parse(fs.readFileSync(new URL("./expected/luck_model.json", import.meta.url)));
const pySim = JSON.parse(fs.readFileSync(new URL("./expected/simulation.json", import.meta.url)));
const which = process.argv[2] || "both";
for (const k of ["cam", "oxf"]) {
  if (which !== "both" && which !== k) continue;
  const ds = JSON.parse(fs.readFileSync(new URL(`./fixture_${k}.json`, import.meta.url)));
  const P = prepare(ds);
  console.log(`\n== ${k}: ${P.n} teams, ${P.R} rounds, warnings ${P.warnings.length}`);
  // 1. motion averages computed from results == motions tab
  const S = seatAudit(P, { round2: true });
  let motOk = S.averages.every((row, r) => row.every((v, s) => Math.abs(v - MOT[k][r][s]) < 1e-9));
  console.log("motion averages match motions tab:", motOk, motOk ? "" : JSON.stringify(S.averages));
  const pyS = new Map(pySeat[k].map((t) => [t.team, t]));
  let maxd = 0, clsMis = 0;
  S.teams.forEach((t) => { const p = pyS.get(t.team); if (p.diff === null) { if (t.diff !== null) clsMis++; return; }
    maxd = Math.max(maxd, Math.abs(Math.round(t.diff * 1000) / 1000 - p.diff)); if (t.cls !== p.cls) clsMis++; });
  console.log(`seat audit: max |diff| vs python ${maxd.toExponential(2)}, class mismatches ${clsMis}`);
  // 2. room audit
  const B = billing(P);
  const RA = roomAudit(P, { bill: B });
  const pyR = new Map(pyRoom[k].teams.map((t) => [t.team, t]));
  let mr = 0; RA.teams.forEach((t) => (mr = Math.max(mr, Math.abs(t.meanPct - pyR.get(t.team).mean_pct))));
  let pu = RA.teams.filter((t) => t.pullups !== pyR.get(t.team).pullups).length;
  console.log(`room audit: ${RA.teams.length} teams, max |mean%| diff ${mr.toExponential(2)}, pull-up mismatches ${pu}`);
  // 3. model
  let t0 = Date.now();
  const M = luckModel(P, B, { nSamples: 600 });
  console.log(`model fit + luck + CIs: ${(Date.now() - t0) / 1000}s`);
  const py2 = new Map(pyS2[k].teams.map((t) => [t.team, t]));
  let ms = 0, mrm = 0, mt = 0, mp = 0, mci = 0;
  M.teams.forEach((t) => { const p = py2.get(t.team);
    ms = Math.max(ms, Math.abs(t.seatTot - p.seat_tot)); mrm = Math.max(mrm, Math.abs(t.roomTot - p.room_tot));
    mt = Math.max(mt, Math.abs(t.total - p.total)); mp = Math.max(mp, Math.abs(t.modelPlace - p.model_place));
    mci = Math.max(mci, Math.abs(t.totalCI[0] - p.total_ci[0]), Math.abs(t.totalCI[1] - p.total_ci[1])); });
  console.log(`luck point estimates vs python: seat ${ms.toExponential(2)}, room ${mrm.toExponential(2)}, total ${mt.toExponential(2)}, model place max diff ${mp}; CI ends max diff ${mci.toFixed(3)}`);
  const H = holdout(P, M.loo);
  console.log(`holdout: model acc ${(H.model.acc * 100).toFixed(1)}% ll ${H.model.logloss.toFixed(4)} | points acc ${(H.points.acc * 100).toFixed(1)}% ll ${H.points.logloss.toFixed(4)}`);
  // 4. simulation
  t0 = Date.now();
  const SIM = simulate(P, M.full, { runs: 10000, breakSize: 16 });
  console.log(`simulation 10k: ${(Date.now() - t0) / 1000}s; overlap real ${SIM.summary.overlapReal.toFixed(2)} neutral ${SIM.summary.overlapNeutral.toFixed(2)} rebreak ${SIM.summary.reBreak.toFixed(2)} (python ${pySim[k].summary.overlap_real.toFixed(2)}/${pySim[k].summary.overlap_neutral.toFixed(2)}/${pySim[k].summary.exp_breakers_rebreak.toFixed(2)})`);
  const pS = new Map(pySim[k].teams.map((t) => [t.team, t]));
  let mpb = 0, worst = "";
  SIM.teams.forEach((t) => { const d = Math.abs(t.pBreak - pS.get(t.team).p_break); if (d > mpb) { mpb = d; worst = t.team; } });
  console.log(`p_break max diff vs python ${(mpb * 100).toFixed(2)}pp (${worst})`);
}
