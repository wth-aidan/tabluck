// Head-to-head strength model.
//
// Every BP room is six head-to-heads; a team's points equal the head-to-heads it won.
// P(i beats j) = sigmoid(s_i + b[r][seat_i] - s_j - b[r][seat_j]).
// s: one strength per team. b: a bonus per seat per round (summing to 0 within a round).
// Pull towards average: each team gets PRIOR_GAMES imaginary head-to-heads (half won) against a
// strength-0 team; seat bonuses get a mild penalty. Fitted by Newton's method (one unique answer).
import { sigmoid, cholesky, cholSolve, cholInverse, mean, linfit, percentile, normalSampler, rng } from "./util.js";

export const DEFAULTS = { priorGames: 2, seatSd: 0.35, varInflation: 2 };

export class Fit {
  constructor(P, { skip = null, ...opts } = {}) {
    this.P = P; this.skip = skip; this.o = { ...DEFAULTS, ...opts };
    const N = P.n, R = P.R;
    this.N = N; this.R = R; this.dim = N + 3 * R;
    // contests as sparse rows: indices + coefficients of the difference d
    const rows = [];
    for (let r = 0; r < R; r++) {
      if (r === skip) continue;
      for (const room of P.rooms[r]) {
        for (let a = 0; a < 4; a++) for (let c = a + 1; c < 4; c++) {
          const ta = room[a], tc = room[c];
          const pa = P.pts[ta][r], pc = P.pts[tc][r];
          if (pa === null || pc === null) continue;
          const coef = new Map();
          const add = (k, v) => coef.set(k, (coef.get(k) || 0) + v);
          add(ta, 1); add(tc, -1);
          this.seatTerms(r, a).forEach(([k, v]) => add(k, v));
          this.seatTerms(r, c).forEach(([k, v]) => add(k, -v));
          const ks = [], vs = [];
          coef.forEach((v, k) => { if (v !== 0) { ks.push(k); vs.push(v); } });
          rows.push({ ks, vs, y: pa > pc ? 1 : 0 });
        }
      }
    }
    this.rows = rows;
    this.solve();
  }
  // seat bonus b[r][s] in terms of the free parameters (3 per round; the 4th is minus their sum)
  seatTerms(r, s) {
    const base = this.P.n + 3 * r;
    if (s < 3) return [[base + s, 1]];
    return [[base, -1], [base + 1, -1], [base + 2, -1]];
  }
  unpack(x) {
    const s = Array.from(x.subarray(0, this.N));
    const b = [];
    for (let r = 0; r < this.R; r++) {
      const q = this.N + 3 * r;
      b.push([x[q], x[q + 1], x[q + 2], -(x[q] + x[q + 1] + x[q + 2])]);
    }
    return { s, b };
  }
  // log-likelihood (with pull towards average), gradient, and negative Hessian
  evaluate(x, wantHess = true) {
    const { N, R, dim } = this, { priorGames: pg, seatSd: sd } = this.o;
    let ll = 0;
    const g = new Float64Array(dim);
    const H = wantHess ? new Float64Array(dim * dim) : null;
    for (const row of this.rows) {
      let d = 0;
      for (let k = 0; k < row.ks.length; k++) d += row.vs[k] * x[row.ks[k]];
      const p = sigmoid(d);
      ll += row.y ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
      const e = row.y - p, w = p * (1 - p);
      for (let k = 0; k < row.ks.length; k++) {
        g[row.ks[k]] += e * row.vs[k];
        if (H) for (let m = 0; m < row.ks.length; m++) H[row.ks[k] * dim + row.ks[m]] += w * row.vs[k] * row.vs[m];
      }
    }
    for (let i = 0; i < N; i++) {
      const q = sigmoid(x[i]);
      ll += (pg / 2) * (Math.log(Math.max(q, 1e-300)) + Math.log(Math.max(1 - q, 1e-300)));
      g[i] += (pg / 2) * (1 - 2 * q);
      if (H) H[i * dim + i] += pg * q * (1 - q);
    }
    for (let r = 0; r < R; r++) {
      const q = N + 3 * r;
      const b = [x[q], x[q + 1], x[q + 2]];
      const b3 = -(b[0] + b[1] + b[2]);
      ll -= (b[0] ** 2 + b[1] ** 2 + b[2] ** 2 + b3 ** 2) / (2 * sd * sd);
      for (let k = 0; k < 3; k++) {
        g[q + k] -= (b[k] - b3) / (sd * sd);
        if (H) for (let m = 0; m < 3; m++) H[(q + k) * dim + (q + m)] += ((k === m ? 1 : 0) + 1) / (sd * sd);
      }
    }
    return { ll, g, H };
  }
  solve() {
    const dim = this.dim;
    let x = new Float64Array(dim);
    let cur = this.evaluate(x);
    for (let it = 0; it < 200; it++) {
      const L = cholesky(cur.H, dim);
      const step = cholSolve(L, dim, cur.g);
      let t = 1, next, xn;
      for (let h = 0; h < 40; h++) {
        xn = x.map((v, k) => v + t * step[k]);
        next = this.evaluate(xn, false);
        if (next.ll >= cur.ll - 1e-12) break;
        t /= 2;
      }
      x = xn;
      const maxStep = Math.max(...step.map((v) => Math.abs(v * t)));
      cur = this.evaluate(x);
      if (maxStep < 1e-10) break;
    }
    this.x = x;
    const L = cholesky(cur.H, dim);
    const inv = cholInverse(L, dim);
    this.cov = inv.map((v) => v * this.o.varInflation);
    this.covL = cholesky(this.cov, dim);
    const { s, b } = this.unpack(x);
    this.s = s; this.b = b;
  }
  // draws of (s, b) around the fit, reflecting its uncertainty
  samples(n, rand) {
    const dim = this.dim, L = this.covL, z = new Float64Array(dim), nrm = normalSampler(rand);
    const out = [];
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < dim; i++) z[i] = nrm();
      const x = new Float64Array(dim);
      for (let i = 0; i < dim; i++) { let v = this.x[i]; for (let j = 0; j <= i; j++) v += L[i * dim + j] * z[j]; x[i] = v; }
      out.push(this.unpack(x));
    }
    return out;
  }
}

// seat luck per team per round: real seats vs all four seats neutral, same strengths
export function seatLuck(P, s, b, comp) {
  const out = new Map(comp.map((t) => [t, new Array(P.R).fill(0)]));
  for (let r = 0; r < P.R; r++) for (const room of P.rooms[r]) for (let a = 0; a < 4; a++) {
    const ta = room[a]; if (!out.has(ta)) continue;
    let v = 0;
    for (let c = 0; c < 4; c++) if (c !== a) {
      const ds = s[ta] - s[room[c]];
      v += sigmoid(ds + b[r][a] - b[r][c]) - sigmoid(ds);
    }
    out.get(ta)[r] = v;
  }
  return out;
}

// room luck in round r: expected points vs real opponents minus vs a typical room at that billing
export function roomLuck(P, r, s, bill, compSet) {
  const present = [];
  P.rooms[r].forEach((room) => room.forEach((t) => present.push(t)));
  const p = present.map((t) => bill.team[t][r].pct);
  const sv = present.map((t) => s[t]);
  const tied = Math.max(...p) - Math.min(...p) < 1e-12;
  const fit = tied ? { a: mean(sv), b: 0 } : linfit(p, sv);
  const resid = sv.map((v, k) => v - (fit.a + fit.b * p[k]));
  // large rounds: 64 evenly spaced representatives of the spread (exact for small rounds)
  let reps = null;
  if (present.length > 160) {
    const sorted = resid.slice().sort((a, b) => a - b), K = 64;
    reps = Array.from({ length: K }, (_, q) => sorted[Math.min(sorted.length - 1, Math.floor(((q + 0.5) / K) * sorted.length))]);
  }
  const out = new Map();
  P.rooms[r].forEach((room) => room.forEach((t) => {
    if (!compSet.has(t)) return;
    let actual = 0;
    room.forEach((o) => { if (o !== t) actual += sigmoid(s[t] - s[o]); });
    const centre = fit.a + fit.b * bill.team[t][r].pct;
    let acc = 0, cnt = 0;
    if (reps) { for (let k = 0; k < reps.length; k++) acc += sigmoid(s[t] - (centre + reps[k])); cnt = reps.length; }
    else for (let k = 0; k < present.length; k++) if (present[k] !== t) { acc += sigmoid(s[t] - (centre + resid[k])); cnt++; }
    out.set(t, actual - 3 * (acc / cnt));
  }));
  return out;
}

export function luckModel(P, bill, { nSamples = 600, seed = 7, onProgress = () => {} } = {}) {
  const comp = []; for (let i = 0; i < P.n; i++) if (P.complete[i]) comp.push(i);
  const compSet = new Set(comp);
  onProgress("Fitting team strengths", 0);
  const full = new Fit(P);
  const loo = [];
  for (let r = 0; r < P.R; r++) { loo.push(new Fit(P, { skip: r })); onProgress("Fitting team strengths", (r + 1) / (P.R + 1)); }

  const compute = (fs, fb, looS) => {
    const sl = seatLuck(P, fs, fb, comp);
    const rl = new Map(comp.map((t) => [t, new Array(P.R).fill(0)]));
    for (let r = 0; r < P.R; r++) { const m = roomLuck(P, r, looS[r], bill, compSet); comp.forEach((t) => (rl.get(t)[r] = m.get(t))); }
    return { sl, rl };
  };
  const point = compute(full.s, full.b, loo.map((f) => f.s));

  onProgress("Measuring uncertainty", 0);
  const rand = rng(seed);
  const fullS = full.samples(nSamples, rand);
  const looSm = loo.map((f) => f.samples(nSamples, rand));
  const totS = new Map(comp.map((t) => [t, []])), seatS = new Map(comp.map((t) => [t, []])), roomS = new Map(comp.map((t) => [t, []]));
  for (let k = 0; k < nSamples; k++) {
    const c = compute(fullS[k].s, fullS[k].b, looSm.map((x) => x[k].s));
    comp.forEach((t) => {
      const a = c.sl.get(t).reduce((x, y) => x + y, 0), b = c.rl.get(t).reduce((x, y) => x + y, 0);
      seatS.get(t).push(a); roomS.get(t).push(b); totS.get(t).push(a + b);
    });
    if (k % 50 === 0) onProgress("Measuring uncertainty", k / nSamples);
  }
  const order = comp.slice().sort((a, b) => full.s[b] - full.s[a] || a - b);
  const modelPlace = new Map(order.map((t, k) => [t, k + 1]));
  const teams = comp.map((t, k) => {
    const sl = point.sl.get(t), rl = point.rl.get(t);
    const seatTot = sl.reduce((a, b) => a + b, 0), roomTot = rl.reduce((a, b) => a + b, 0);
    return {
      i: t, team: P.T[t].name, rank: P.T[t].rank, tabPlace: k + 1, modelPlace: modelPlace.get(t), pts: P.totalPts[t],
      strength: full.s[t], seat: sl, room: rl, seatTot, roomTot, total: seatTot + roomTot,
      seatCI: [percentile(seatS.get(t), 10), percentile(seatS.get(t), 90)],
      roomCI: [percentile(roomS.get(t), 10), percentile(roomS.get(t), 90)],
      totalCI: [percentile(totS.get(t), 10), percentile(totS.get(t), 90)],
    };
  });
  return { full, loo, teams, seatBonus: full.b, samples: { seat: seatS, room: roomS, total: totS } };
}

// Out-of-sample check: predict each round's head-to-heads from fits that never saw that round.
export function holdout(P, loo) {
  const pm = [], dp = [], ys = [];
  for (let r = 0; r < P.R; r++) {
    const s = loo[r].s;
    const other = P.T.map((_, t) => {
      let a = 0, c = 0;
      for (let i = 0; i < P.R; i++) if (i !== r && P.pts[t][i] !== null) { a += P.pts[t][i]; c++; }
      return c ? a / c : 0;
    });
    for (const room of P.rooms[r]) for (let a = 0; a < 4; a++) for (let c = a + 1; c < 4; c++) {
      const ta = room[a], tc = room[c], pa = P.pts[ta][r], pc = P.pts[tc][r];
      if (pa === null || pc === null) continue;
      pm.push(1 / (1 + Math.exp(-(s[ta] - s[tc])))); dp.push(other[ta] - other[tc]); ys.push(pa > pc ? 1 : 0);
    }
  }
  const ll = (p) => -mean(p.map((v, k) => { const q = Math.min(Math.max(v, 1e-9), 1 - 1e-9); return ys[k] ? Math.log(q) : Math.log(1 - q); }));
  const acc = (p) => mean(p.map((v, k) => ((v > 0.5) === (ys[k] === 1) ? 1 : 0)));
  // points-table baseline: one fitted steepness k in [0, 10] (golden-section search)
  const f = (k) => ll(dp.map((d) => 1 / (1 + Math.exp(-k * d))));
  let lo = 0, hi = 10; const gr = (Math.sqrt(5) - 1) / 2;
  let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo), f1 = f(c1), f2 = f(c2);
  for (let i = 0; i < 80; i++) {
    if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); }
    else { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); }
  }
  const k = (lo + hi) / 2, pb = dp.map((d) => 1 / (1 + Math.exp(-k * d)));
  const buckets = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([a, b]) => {
    const sel = []; pm.forEach((v, i) => { const fav = Math.max(v, 1 - v); if (fav >= a && fav < b) sel.push(i); });
    return { lo: a, hi: Math.min(b, 1), n: sel.length,
      predicted: sel.length ? mean(sel.map((i) => Math.max(pm[i], 1 - pm[i]))) : null,
      won: sel.length ? mean(sel.map((i) => ((pm[i] >= 0.5 ? ys[i] : 1 - ys[i])))) : null };
  });
  return { n: ys.length, model: { acc: acc(pm), logloss: ll(pm) }, points: { acc: acc(pb), logloss: ll(pb) },
    coin: { acc: 0.5, logloss: Math.log(2) }, buckets };
}
