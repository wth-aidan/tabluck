// Re-run the tournament many times with the fitted strengths.
//  - every run draws strengths and seat bonuses from the fit's uncertainty
//  - round 1 random; later rounds power-paired (random within a points bracket, leftovers pulled up)
//  - seats balanced: in each room, the arrangement repeating teams' past seats least
//  - performance = strength + seat bonus + Gumbel noise (exactly the head-to-head model), ranked 3/2/1/0
//  - break = top N on points, ties split by total performance (stand-in for speaks)
// Teams that missed rounds are replaced by filler teams of their average strength, which cannot break.
import { rng, normalSampler, percentile, mean } from "./util.js";

const PERMS = (() => {
  const out = [];
  const go = (a, rest) => { if (!rest.length) out.push(a); rest.forEach((v, i) => go([...a, v], rest.filter((_, j) => j !== i))); };
  go([], [0, 1, 2, 3]);
  return out;
})();

export function simulate(P, fit, { runs = 10000, seed = 11, breakSize = 16, onProgress = () => {} } = {}) {
  const comp = [], partial = [];
  for (let i = 0; i < P.n; i++) { if (P.complete[i]) comp.push(i); else if (P.inAnyDraw[i]) partial.push(i); }
  const Nc = comp.length, R = P.R;
  const roomCounts = P.rooms.map((rr) => rr.length);
  const mode = roomCounts.slice().sort((a, b) => roomCounts.filter((v) => v === b).length - roomCounts.filter((v) => v === a).length)[0];
  const nRooms = Math.max(mode, Math.ceil(Nc / 4));
  const Nf = nRooms * 4;
  const nFill = Nf - Nc;
  const bk = Math.min(breakSize, Nc);

  const rand = rng(seed), nrm = normalSampler(rand);
  const dim = fit.dim, L = fit.covL, x = new Float64Array(dim), z = new Float64Array(dim);

  const res = { real: { broke: new Uint32Array(Nc), overlap: 0 }, neutral: { broke: new Uint32Array(Nc), overlap: 0 } };
  const neutralRuns = Math.ceil(runs / 4);
  const placeHist = Array.from({ length: Nc }, () => new Uint32Array(Nc + 1));
  const ptsHist = Array.from({ length: Nc }, () => new Uint32Array(3 * R + 1));
  const fieldHist = new Float64Array(3 * R + 1);
  const sumPlace = new Float64Array(Nc);
  const actualPts = comp.map((t) => P.totalPts[t]);
  const below = new Float64Array(Nc), equal = new Float64Array(Nc);

  const strength = new Float64Array(Nf), seatb = Array.from({ length: R }, () => new Float64Array(4));
  const pts = new Int32Array(Nf), perf = new Float64Array(Nf), hist = new Int32Array(Nf * 4);
  const order = new Int32Array(Nf), roomPerf = new Float64Array(4), roomT = new Int32Array(4), roomSeat = new Int32Array(4);
  const buckets = Array.from({ length: 3 * R + 1 }, () => []);
  const idxArr = Array.from({ length: Nc }, (_, k) => k);

  for (let run = 0; run < runs; run++) {
    // draw strengths and seat bonuses
    for (let i = 0; i < dim; i++) z[i] = nrm();
    for (let i = 0; i < dim; i++) { let v = fit.x[i]; for (let j = 0; j <= i; j++) v += L[i * dim + j] * z[j]; x[i] = v; }
    for (let k = 0; k < Nc; k++) strength[k] = x[comp[k]];
    let fillS = 0; partial.forEach((t) => (fillS += x[t])); fillS = partial.length ? fillS / partial.length : 0;
    for (let k = Nc; k < Nf; k++) strength[k] = fillS;
    for (let r = 0; r < R; r++) { const q = fit.N + 3 * r; seatb[r][0] = x[q]; seatb[r][1] = x[q + 1]; seatb[r][2] = x[q + 2]; seatb[r][3] = -(x[q] + x[q + 1] + x[q + 2]); }

    // true top N for this run's strengths
    const trueOrder = idxArr.slice().sort((a, b) => strength[b] - strength[a]);
    const isTop = new Uint8Array(Nc); for (let k = 0; k < bk; k++) isTop[trueOrder[k]] = 1;

    for (const variant of (run % 4 === 0 ? ["real", "neutral"] : ["real"])) {
      pts.fill(0); perf.fill(0); hist.fill(0);
      for (let r = 0; r < R; r++) {
        // power pairing: bucket by points, shuffle inside each bucket, highest first
        buckets.forEach((b) => (b.length = 0));
        for (let t = 0; t < Nf; t++) buckets[pts[t]].push(t);
        let pos = 0;
        for (let p = buckets.length - 1; p >= 0; p--) {
          const b = buckets[p];
          for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = b[i]; b[i] = b[j]; b[j] = tmp; }
          for (const t of b) order[pos++] = t;
        }
        for (let room = 0; room < nRooms; room++) {
          for (let k = 0; k < 4; k++) roomT[k] = order[room * 4 + k];
          // seat balancing
          let best = 0, bestCost = Infinity;
          const off = Math.floor(rand() * 24);
          for (let q = 0; q < 24; q++) {
            const p = (q + off) % 24, perm = PERMS[p];
            const c = hist[roomT[0] * 4 + perm[0]] + hist[roomT[1] * 4 + perm[1]] + hist[roomT[2] * 4 + perm[2]] + hist[roomT[3] * 4 + perm[3]];
            if (c < bestCost) { bestCost = c; best = p; }
          }
          const perm = PERMS[best];
          for (let k = 0; k < 4; k++) {
            roomSeat[k] = perm[k];
            const u = rand();
            const g = -Math.log(-Math.log(u > 1e-300 ? u : 1e-300));
            roomPerf[k] = strength[roomT[k]] + (variant === "real" ? seatb[r][perm[k]] : 0) + g;
          }
          for (let k = 0; k < 4; k++) {
            let rank = 0;
            for (let m = 0; m < 4; m++) if (roomPerf[m] > roomPerf[k]) rank++;
            const t = roomT[k];
            pts[t] += 3 - rank; perf[t] += roomPerf[k]; hist[t * 4 + roomSeat[k]]++;
          }
        }
      }
      // final standings among real teams
      const fin = idxArr.slice().sort((a, b) => (pts[b] - pts[a]) || (perf[b] - perf[a]));
      const out = res[variant];
      for (let k = 0; k < fin.length; k++) {
        const t = fin[k];
        if (k < bk) { out.broke[t]++; if (isTop[t]) out.overlap++; }
        if (variant === "real") {
          placeHist[t][k + 1]++; sumPlace[t] += k + 1; ptsHist[t][pts[t]]++;
          if (pts[t] < actualPts[t]) below[t]++; else if (pts[t] === actualPts[t]) equal[t]++;
        }
      }
      if (variant === "real") for (let k = 0; k < Nc; k++) fieldHist[pts[k]]++;
    }
    if (run % 250 === 0) onProgress("Re-running the tournament", run / runs);
  }

  const placeQuant = (h, q) => {
    const target = (q / 100) * runs; let acc = 0;
    for (let p = 1; p < h.length; p++) { acc += h[p]; if (acc >= target) return p; }
    return h.length - 1;
  };
  const teams = comp.map((t, k) => ({
    i: t, team: P.T[t].name, rank: P.T[t].rank, tabPlace: k + 1, pts: actualPts[k], broke: k < bk,
    pBreak: res.real.broke[k] / runs, pBreakNeutral: res.neutral.broke[k] / neutralRuns,
    meanPlace: sumPlace[k] / runs, place80: [placeQuant(placeHist[k], 10), placeQuant(placeHist[k], 90)],
    ptsPct: (below[k] + 0.5 * equal[k]) / runs,
    placeHist: Array.from(placeHist[k]).slice(1), ptsHist: Array.from(ptsHist[k]),
  }));
  const realHist = new Array(3 * R + 1).fill(0); actualPts.forEach((p) => realHist[p]++);
  return {
    runs, breakSize: bk, nRooms, nFill, teams,
    summary: {
      overlapReal: res.real.overlap / runs, overlapNeutral: res.neutral.overlap / neutralRuns,
      simHist: Array.from(fieldHist, (v) => v / runs), realHist,
      reBreak: teams.filter((t) => t.broke).reduce((a, t) => a + t.pBreak, 0),
      sureCount: teams.filter((t) => t.pBreak >= 0.75).length,
    },
  };
}
