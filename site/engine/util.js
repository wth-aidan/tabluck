// Small numeric helpers shared by every analysis. No dependencies.

export function rng(seed = 1) {
  // mulberry32: fast, seedable, good enough for simulation
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalSampler(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u <= 1e-300) u = rand();
    v = rand();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
}

export const sigmoid = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const sum = (a) => a.reduce((x, y) => x + y, 0);

// numpy-style linear-interpolated percentile on an unsorted array
export function percentile(arr, q) {
  const s = Float64Array.from(arr).sort();
  if (!s.length) return NaN;
  const pos = (s.length - 1) * (q / 100);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ordinary least squares y = a + b x
export function linfit(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  if (sxx < 1e-24) return { a: my, b: 0 };
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

export function pearson(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

export function pstdev(a) {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
}

// Dense symmetric positive-definite helpers (row-major Float64Array, n x n)
export function cholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error("Matrix not positive definite");
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  return L;
}

export function cholSolve(L, n, b) {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

export function cholInverse(L, n) {
  const inv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0); e[j] = 1;
    const col = cholSolve(L, n, e);
    for (let i = 0; i < n; i++) inv[i * n + j] = col[i];
  }
  return inv;
}

// round half away from zero to d decimals (for display-consistent classification)
export function roundTo(v, d) {
  const f = 10 ** d;
  return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
}
