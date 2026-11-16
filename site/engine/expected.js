// Expected places: where each team would have finished with that analysis's luck taken out.
// Each report uses only its own measure of luck, always as: points − luck, re-ranked, speaks breaking ties.
//   draw    model-free: seat luck from the motion-tab seat values. Range: re-sample each round's rooms (bootstrap).
//   room    the luck model's room luck (in points). Range: the model's uncertainty samples.
//   overall the luck model's total luck (seat + room). Range: the model's uncertainty samples.
// With every team's luck at zero this gives back the real tab exactly.
// (An earlier "re-draw the whole tournament" version was dropped: comparing teams who never met leaned on the model's
// strengths, which are pulled towards average, so it moved bottom teams up and top teams down regardless of luck.)
import { rng } from "./util.js";

const spkOf = (P, i) => (P.T[i].spkTotal != null ? +P.T[i].spkTotal : (P.spk[i] || []).reduce((a, v) => a + (v || 0), 0));
const rankDesc = (P, pool, val) => {
  const order = pool.slice().sort((a, c) => val(c) - val(a) || spkOf(P, c) - spkOf(P, a) || a - c);
  const place = new Map(); order.forEach((t, k) => place.set(t, k + 1)); return place;
};
// expected place = rank of the average place over the re-draws (ties keep the better average)
const summarise = (pool, sumPlace, hist, runs, extra = () => ({})) => {
  const mean = new Map(pool.map((t) => [t, sumPlace.get(t) / runs]));
  return pool.map((t) => {
    const h = hist.get(t), q = (p) => { const target = p * runs; let acc = 0; for (let k = 1; k < h.length; k++) { acc += h[k]; if (acc >= target) return k; } return h.length - 1; };
    return { i: t, meanPlace: mean.get(t), expRank: 1 + pool.filter((o) => mean.get(o) < mean.get(t)).length, range80: [q(0.1), q(0.9)],
      placeHist: Array.from(h.slice(1, pool.length + 1)), ...extra(t) };
  });
};

// ---------------------------------------------------------------- draw (model-free)
export function drawExpected(P, seat, { boots = 1000, seed = 5 } = {}) {
  const pool = seat.teams.filter((t) => t.played > 0).map((t) => t.i);
  const adjPts = new Map(seat.teams.map((t) => [t.i, P.totalPts[t.i] - (t.diff || 0) * t.played]));
  const point = rankDesc(P, pool, (t) => adjPts.get(t));
  const rand = rng(seed), R = P.R;
  const sumPlace = new Map(pool.map((t) => [t, 0])), hist = new Map(pool.map((t) => [t, new Uint32Array(pool.length + 1)]));
  for (let bt = 0; bt < boots; bt++) {
    const avg = P.rooms.map((rr, r) => {
      const s = [0, 0, 0, 0], c = [0, 0, 0, 0];
      for (let q = 0; q < rr.length; q++) { const room = rr[Math.floor(rand() * rr.length)]; room.forEach((t, k) => { const p = P.pts[t][r]; if (p !== null) { s[k] += p; c[k]++; } }); }
      return s.map((v, k) => (c[k] ? v / c[k] : 1.5));
    });
    const adj = new Map(pool.map((t) => {
      let luck = 0;
      for (let r = 0; r < R; r++) { const s = P.seat[t][r]; if (s !== null && P.pts[t][r] !== null) luck += avg[r][s] - 1.5; }
      return [t, P.totalPts[t] - luck];
    }));
    const pl = rankDesc(P, pool, (t) => adj.get(t));
    pool.forEach((t) => { const k = pl.get(t); sumPlace.set(t, sumPlace.get(t) + k); hist.get(t)[k]++; });
  }
  const rows = summarise(pool, sumPlace, hist, boots, (t) => ({ adjPts: adjPts.get(t), pointRank: point.get(t) }));
  // the headline expected place is the point estimate (no resampling); the bootstrap only supplies the range and chart
  rows.forEach((r) => { r.expRank = r.pointRank; });
  return { boots, pool: pool.length, teams: rows };
}

// ---------------------------------------------------------------- room + overall (points minus luck)
// Same idea as the draw audit, using the luck model's luck in points: points − luck, re-ranked, speaks break ties.
// The range re-ranks each of the model's plausible versions of everyone's luck (its uncertainty samples).
export function luckExpected(P, model, which, { breakSize = 16 } = {}) {
  const teams = model.teams, pool = teams.map((t) => t.i), Nc = pool.length, bk = Math.min(breakSize, Nc);
  const luckOf = new Map(teams.map((t) => [t.i, which === "room" ? t.roomTot : t.total]));
  const smp = which === "room" ? model.samples.room : model.samples.total;
  const adjPts = new Map(pool.map((t) => [t, P.totalPts[t] - luckOf.get(t)]));
  const point = rankDesc(P, pool, (t) => adjPts.get(t));
  const nS = smp.get(pool[0]).length;
  const sumPlace = new Map(pool.map((t) => [t, 0])), hist = new Map(pool.map((t) => [t, new Uint32Array(Nc + 1)])), brk = new Map(pool.map((t) => [t, 0]));
  for (let k = 0; k < nS; k++) {
    const pl = rankDesc(P, pool, (t) => P.totalPts[t] - smp.get(t)[k]);
    pool.forEach((t) => { const p = pl.get(t); sumPlace.set(t, sumPlace.get(t) + p); hist.get(t)[p]++; if (p <= bk) brk.set(t, brk.get(t) + 1); });
  }
  const rows = summarise(pool, sumPlace, hist, nS, (t) => ({ adjPts: adjPts.get(t), pointRank: point.get(t), pBreak: brk.get(t) / nS }));
  rows.forEach((r) => { r.expRank = r.pointRank; });
  return { samples: nS, breakSize: bk, teams: rows };
}
