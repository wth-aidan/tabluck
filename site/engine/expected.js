// Expected places: where each team would have finished with that analysis's luck taken out.
// Each report uses only its own measure of luck, always as: points − luck, re-ranked, speaks breaking ties.
//   draw    model-free: seat luck from the motion-tab seat values. Range: re-sample each round's rooms (bootstrap).
//   room    the room audit's own difficulty %, converted to points at one rate fitted from the luck model.
//           Range: width borrowed from the model's room-luck uncertainty.
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

// Ties: whole team points are coarse, and a points group can hold 20 teams split only by speaks. Taking 0.01 points
// off a team would otherwise drop it below its whole group. So each points group is spread over ±0.5 points in real
// tab order (best speaks highest): to pass a team on the same points you need to gain more than the gap between you.
// With zero luck everywhere this still gives back the real tab exactly.
function speakSpread(P, pool) {
  const groups = new Map();
  pool.forEach((t) => { const k = P.totalPts[t]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const off = new Map();
  for (const g of groups.values()) {
    g.sort((a, c) => (parseInt(P.T[a].rank, 10) || 1e9) - (parseInt(P.T[c].rank, 10) || 1e9) || spkOf(P, c) - spkOf(P, a) || a - c);
    g.forEach((t, j) => off.set(t, 0.5 - (j + 0.5) / g.length));
  }
  return off;
}
// place if only this team's luck were removed and everyone else kept their real result (fast: binary search)
const ownRanker = (P, pool, off) => {
  const real = new Map(pool.map((t) => [t, P.totalPts[t] + off.get(t)]));
  const desc = [...real.values()].sort((a, c) => c - a);
  return (t, adjVal) => {
    const mine = adjVal + off.get(t);
    let lo = 0, hi = desc.length; // count of real scores strictly above mine
    while (lo < hi) { const m = (lo + hi) >> 1; if (desc[m] > mine + 1e-12) lo = m + 1; else hi = m; }
    return lo - (real.get(t) > mine + 1e-12 ? 1 : 0) + 1;
  };
};
const q10q90 = (arr) => { const a = arr.slice().sort((x, y) => x - y); const at = (p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))]; return [at(0.1), at(0.9)]; };
const ownRanks = (P, pool, off, adj) => {
  const real = new Map(pool.map((t) => [t, P.totalPts[t] + off.get(t)]));
  const sorted = [...real.values()].sort((a, c) => c - a);
  return new Map(pool.map((t) => {
    const mine = adj(t) + off.get(t); let above = 0;
    for (const v of sorted) { if (v > mine + 1e-12) above++; else break; }
    // its own real score is in the list; remove it if it sits above its new score
    if (real.get(t) > mine + 1e-12) above--;
    return [t, above + 1];
  }));
};

// ---------------------------------------------------------------- draw (model-free)
export function drawExpected(P, seat, { boots = 1000, seed = 5 } = {}) {
  const pool = seat.teams.filter((t) => t.played > 0).map((t) => t.i);
  const adjPts = new Map(seat.teams.map((t) => [t.i, P.totalPts[t.i] - (t.diff || 0) * t.played]));
  const off = speakSpread(P, pool);
  const point = rankDesc(P, pool, (t) => adjPts.get(t) + off.get(t));
  const own = ownRanks(P, pool, off, (t) => adjPts.get(t));
  const rand = rng(seed), R = P.R;
  const sumPlace = new Map(pool.map((t) => [t, 0])), hist = new Map(pool.map((t) => [t, new Uint32Array(pool.length + 1)]));
  const ownOf = ownRanker(P, pool, off), ownS = new Map(pool.map((t) => [t, []]));
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
    const pl = rankDesc(P, pool, (t) => adj.get(t) + off.get(t));
    pool.forEach((t) => { const k = pl.get(t); sumPlace.set(t, sumPlace.get(t) + k); hist.get(t)[k]++; ownS.get(t).push(ownOf(t, adj.get(t))); });
  }
  const rows = summarise(pool, sumPlace, hist, boots, (t) => ({ adjPts: adjPts.get(t), pointRank: point.get(t), ownRank: own.get(t), ownRange80: q10q90(ownS.get(t)), spread: off.get(t) }));
  // the headline expected place is the point estimate (no resampling); the bootstrap only supplies the range and chart
  rows.forEach((r) => { r.expRank = r.pointRank; });
  return { boots, pool: pool.length, teams: rows };
}

// ---------------------------------------------------------------- shared: re-rank the whole tab
// Room and overall luck only exist for teams that debated every round. Everyone else keeps their real points, so
// expected places stay on the same scale as the real tab (zero luck for everyone gives the real tab back exactly).
function rankWholeTab(P, analysed, adjPts, sampleAdj, nS, breakSize) {
  const pool = []; for (let i = 0; i < P.n; i++) if (P.inAnyDraw[i]) pool.push(i);
  const adj = (t) => (adjPts.has(t) ? adjPts.get(t) : P.totalPts[t]);
  const off = speakSpread(P, pool);
  const point = rankDesc(P, pool, (t) => adj(t) + off.get(t));
  const own = ownRanks(P, pool, off, adj);
  const sumPlace = new Map(pool.map((t) => [t, 0])), hist = new Map(pool.map((t) => [t, new Uint32Array(pool.length + 1)])), brk = new Map(pool.map((t) => [t, 0]));
  const ownOf = ownRanker(P, pool, off), ownS = new Map(pool.map((t) => [t, []]));
  for (let k = 0; k < nS; k++) {
    const sv = (t) => (adjPts.has(t) ? sampleAdj(t, k) : P.totalPts[t]);
    const pl = rankDesc(P, pool, (t) => sv(t) + off.get(t));
    pool.forEach((t) => { const p = pl.get(t); sumPlace.set(t, sumPlace.get(t) + p); hist.get(t)[p]++; if (p <= breakSize) brk.set(t, brk.get(t) + 1); if (adjPts.has(t)) ownS.get(t).push(ownOf(t, sv(t))); });
  }
  const rows = summarise(pool, sumPlace, hist, nS, (t) => ({ adjPts: adj(t), pointRank: point.get(t), ownRank: own.get(t), ownRange80: ownS.get(t).length ? q10q90(ownS.get(t)) : null, spread: off.get(t), pBreak: brk.get(t) / nS, analysed: analysed.has(t) }));
  rows.forEach((r) => { r.expRank = r.pointRank; });
  return rows;
}

// ---------------------------------------------------------------- overall (points minus luck)
// Uses the luck model's total luck (seat + room): points − luck, re-ranked, speaks break ties.
// The range re-ranks each of the model's plausible versions of everyone's luck (its uncertainty samples).
export function luckExpected(P, model, { breakSize = 16 } = {}) {
  const analysed = new Set(model.teams.map((t) => t.i)), smp = model.samples.total;
  const adjPts = new Map(model.teams.map((t) => [t.i, P.totalPts[t.i] - t.total]));
  const nS = smp.get(model.teams[0].i).length;
  const rows = rankWholeTab(P, analysed, adjPts, (t, k) => P.totalPts[t] - smp.get(t)[k], nS, breakSize);
  return { samples: nS, teams: rows };
}

// ---------------------------------------------------------------- room (from the room audit's own numbers)
// The room audit measures difficulty as a % of the field. To take it off team points it needs one conversion rate:
// points per 1% harder, estimated from the luck model across every team-round (about 0.02 at Oxford and Cambridge).
// So room luck = −rate × (sum of the team's difficulty %), and the ordering follows the % shown in the room table.
// The range borrows its width from the model's room-luck uncertainty (the audit has no uncertainty of its own).
export function roomAuditExpected(P, room, model, { breakSize = 16 } = {}) {
  const M = new Map(model.teams.map((t) => [t.i, t]));
  const rows = room.teams.filter((t) => M.has(t.i));
  let sxy = 0, sxx = 0, mx = 0, my = 0, n = 0;
  rows.forEach((t) => t.hardPct.forEach((h, r) => { if (h != null) { mx += h; my += M.get(t.i).room[r]; n++; } }));
  mx /= n; my /= n;
  rows.forEach((t) => t.hardPct.forEach((h, r) => { if (h != null) { sxy += (h - mx) * (M.get(t.i).room[r] - my); sxx += (h - mx) ** 2; } }));
  const rate = Math.max(0, -sxy / sxx); // points lost per 1% harder
  const luck = new Map(rows.map((t) => [t.i, -rate * t.hardPct.reduce((a, h) => a + (h || 0), 0)]));
  const adjPts = new Map(rows.map((t) => [t.i, P.totalPts[t.i] - luck.get(t.i)]));
  const smp = model.samples.room, nS = smp.get(rows[0].i).length;
  const out = rankWholeTab(P, new Set(luck.keys()), adjPts, (t, k) => adjPts.get(t) - (smp.get(t)[k] - M.get(t).roomTot), nS, breakSize);
  out.forEach((r) => { if (luck.has(r.i)) r.luckPts = luck.get(r.i); });
  return { rate, samples: nS, teams: out };
}
