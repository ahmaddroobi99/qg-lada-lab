import { bilinear, type BarotropicQG } from "./model";
import { Rng } from "./rng";

const TWO_PI = 2 * Math.PI;

function gaspariCohn(z: number): number {
  const r = Math.abs(z);
  if (r <= 1) {
    return ((((-0.25 * r + 0.5) * r + 0.625) * r - 5 / 3) * r * r + 1);
  }
  if (r <= 2) {
    return (((((1 / 12) * r - 0.5) * r + 0.625) * r + 5 / 3) * r - 5) * r + 4 - 2 / (3 * r);
  }
  return 0;
}

function pdist(x1: number, y1: number, x2: number, y2: number): number {
  let dx = Math.abs(x1 - x2);
  let dy = Math.abs(y1 - y2);
  if (dx > Math.PI) dx = TWO_PI - dx;
  if (dy > Math.PI) dy = TWO_PI - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Solve A X = B. A is n×n row-major, B is n×nrhs row-major. Returns X n×nrhs. */
export function solveLinear(Ain: Float64Array, n: number, Bin: Float64Array, nrhs: number): Float64Array {
  const A = Ain.slice();
  const B = Bin.slice();
  for (let k = 0; k < n; k++) {
    let piv = k;
    let mag = Math.abs(A[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]!);
      if (v > mag) {
        mag = v;
        piv = i;
      }
    }
    if (mag < 1e-14) A[k * n + k] = (A[k * n + k] ?? 0) + 1e-8;
    if (piv !== k) {
      for (let j = 0; j < n; j++) {
        const t = A[k * n + j]!;
        A[k * n + j] = A[piv * n + j]!;
        A[piv * n + j] = t;
      }
      for (let j = 0; j < nrhs; j++) {
        const t = B[k * nrhs + j]!;
        B[k * nrhs + j] = B[piv * nrhs + j]!;
        B[piv * nrhs + j] = t;
      }
    }
    const akk = A[k * n + k]! || 1e-15;
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k]! / akk;
      A[i * n + k] = f;
      for (let j = k + 1; j < n; j++) A[i * n + j]! -= f * A[k * n + j]!;
      for (let j = 0; j < nrhs; j++) B[i * nrhs + j]! -= f * B[k * nrhs + j]!;
    }
  }
  const X = new Float64Array(n * nrhs);
  for (let j = 0; j < nrhs; j++) {
    for (let i = n - 1; i >= 0; i--) {
      let s = B[i * nrhs + j]!;
      for (let k = i + 1; k < n; k++) s -= A[i * n + k]! * X[k * nrhs + j]!;
      X[i * nrhs + j] = s / (A[i * n + i]! || 1e-15);
    }
  }
  return X;
}

export function observeVelocity(
  model: BarotropicQG,
  q: Float64Array,
  n: number,
  xs: Float64Array,
  ys: Float64Array,
  uo: Float64Array,
  vo: Float64Array,
  y: Float64Array,
): void {
  model.invert(q);
  bilinear(model.u, n, xs, ys, uo);
  bilinear(model.v, n, xs, ys, vo);
  const L = xs.length;
  for (let i = 0; i < L; i++) {
    y[i] = uo[i]!;
    y[L + i] = vo[i]!;
  }
}

export function stochasticEnkf(
  ens: Float64Array,
  ne: number,
  n: number,
  yEns: Float64Array,
  d: Float64Array,
  sigmaO: number,
  xs: Float64Array,
  ys: Float64Array,
  locRadius: number,
  localize: boolean,
  inflation: number,
  stochastic: boolean,
  rng: Rng,
): void {
  const ns = n * n;
  const nobs = d.length;
  const L = xs.length;
  const den = Math.max(ne - 1, 1);

  const xMean = new Float64Array(ns);
  const yMean = new Float64Array(nobs);
  for (let e = 0; e < ne; e++) {
    const off = e * ns;
    for (let s = 0; s < ns; s++) xMean[s]! += ens[off + s]!;
    const yo = e * nobs;
    for (let o = 0; o < nobs; o++) yMean[o]! += yEns[yo + o]!;
  }
  const invNe = 1 / ne;
  for (let s = 0; s < ns; s++) xMean[s]! *= invNe;
  for (let o = 0; o < nobs; o++) yMean[o]! *= invNe;

  const pyy = new Float64Array(nobs * nobs);
  const pxy = new Float64Array(ns * nobs);
  for (let e = 0; e < ne; e++) {
    const xoff = e * ns;
    const yoff = e * nobs;
    for (let s = 0; s < ns; s++) {
      const xa = ens[xoff + s]! - xMean[s]!;
      const row = s * nobs;
      for (let o = 0; o < nobs; o++) pxy[row + o]! += xa * (yEns[yoff + o]! - yMean[o]!);
    }
    for (let a = 0; a < nobs; a++) {
      const ya = yEns[yoff + a]! - yMean[a]!;
      const row = a * nobs;
      for (let b = 0; b < nobs; b++) pyy[row + b]! += ya * (yEns[yoff + b]! - yMean[b]!);
    }
  }
  const invDen = 1 / den;
  for (let i = 0; i < pxy.length; i++) pxy[i]! *= invDen;
  for (let i = 0; i < pyy.length; i++) pyy[i]! *= invDen;

  if (localize) {
    const dx = TWO_PI / n;
    for (let s = 0; s < ns; s++) {
      const gy = Math.floor(s / n) * dx;
      const gx = (s % n) * dx;
      const row = s * nobs;
      for (let o = 0; o < nobs; o++) {
        const ti = o % L;
        const rho = gaspariCohn(pdist(gx, gy, xs[ti]!, ys[ti]!) / locRadius);
        pxy[row + o]! *= rho;
      }
    }
    for (let a = 0; a < nobs; a++) {
      const ia = a % L;
      for (let b = 0; b < nobs; b++) {
        const ib = b % L;
        pyy[a * nobs + b]! *= gaspariCohn(pdist(xs[ia]!, ys[ia]!, xs[ib]!, ys[ib]!) / locRadius);
      }
    }
  }

  const rvar = sigmaO * sigmaO;
  for (let o = 0; o < nobs; o++) pyy[o * nobs + o]! += rvar + 1e-8;

  // B = pxy^T (nobs × ns), solve pyy X = B, K = X^T (ns × nobs)
  const Bt = new Float64Array(nobs * ns);
  for (let s = 0; s < ns; s++) {
    for (let o = 0; o < nobs; o++) Bt[o * ns + s] = pxy[s * nobs + o]!;
  }
  const XT = solveLinear(pyy, nobs, Bt, ns);

  const innov = new Float64Array(ne * nobs);
  for (let e = 0; e < ne; e++) {
    const off = e * nobs;
    for (let o = 0; o < nobs; o++) {
      const pert = stochastic ? rng.normal(0, sigmaO) : 0;
      innov[off + o] = d[o]! + pert - yEns[off + o]!;
    }
  }

  for (let e = 0; e < ne; e++) {
    const xoff = e * ns;
    const ioff = e * nobs;
    for (let s = 0; s < ns; s++) {
      let acc = 0;
      for (let o = 0; o < nobs; o++) acc += innov[ioff + o]! * XT[o * ns + s]!;
      ens[xoff + s]! += acc;
    }
  }

  xMean.fill(0);
  for (let e = 0; e < ne; e++) {
    const off = e * ns;
    for (let s = 0; s < ns; s++) xMean[s]! += ens[off + s]!;
  }
  for (let s = 0; s < ns; s++) xMean[s]! *= invNe;
  for (let e = 0; e < ne; e++) {
    const off = e * ns;
    for (let s = 0; s < ns; s++) {
      ens[off + s] = xMean[s]! + inflation * (ens[off + s]! - xMean[s]!);
    }
  }
}

export function hybridResample(
  ens: Float64Array,
  ne: number,
  n: number,
  yEns: Float64Array,
  d: Float64Array,
  sigmaO: number,
  essThreshold: number,
  rng: Rng,
): number {
  const ns = n * n;
  const nobs = d.length;
  const logw = new Float64Array(ne);
  let maxLog = -Infinity;
  for (let e = 0; e < ne; e++) {
    const off = e * nobs;
    let s = 0;
    for (let o = 0; o < nobs; o++) {
      const r = (yEns[off + o]! - d[o]!) / sigmaO;
      s += r * r;
    }
    logw[e] = -0.5 * s;
    if (logw[e]! > maxLog) maxLog = logw[e]!;
  }
  const w = new Float64Array(ne);
  let sum = 0;
  for (let e = 0; e < ne; e++) {
    w[e] = Math.exp(logw[e]! - maxLog);
    sum += w[e]!;
  }
  if (!(sum > 0) || !Number.isFinite(sum)) return ne;
  let w2 = 0;
  for (let e = 0; e < ne; e++) {
    w[e]! /= sum;
    w2 += w[e]! * w[e]!;
  }
  const ess = 1 / w2;
  if (ess >= essThreshold * ne) return ess;

  const u0 = rng.next() / ne;
  const cum = new Float64Array(ne);
  cum[0] = w[0]!;
  for (let e = 1; e < ne; e++) cum[e] = cum[e - 1]! + w[e]!;
  const idx = new Int32Array(ne);
  let j = 0;
  for (let e = 0; e < ne; e++) {
    const t = u0 + e / ne;
    while (j < ne - 1 && cum[j]! < t) j += 1;
    idx[e] = j;
  }
  const copy = ens.slice();
  let spread = 0;
  for (let i = 0; i < ens.length; i++) spread += ens[i]! * ens[i]!;
  spread = Math.sqrt(spread / ens.length) + 1e-8;
  for (let e = 0; e < ne; e++) {
    const src = idx[e]! * ns;
    const dst = e * ns;
    for (let s = 0; s < ns; s++) ens[dst + s] = copy[src + s]! + 0.015 * spread * rng.normal();
  }
  return ess;
}

export function ensembleMean(ens: Float64Array, ne: number, n: number, out: Float64Array): void {
  const ns = n * n;
  out.fill(0);
  for (let e = 0; e < ne; e++) {
    const off = e * ns;
    for (let s = 0; s < ns; s++) out[s]! += ens[off + s]!;
  }
  const inv = 1 / ne;
  for (let s = 0; s < ns; s++) out[s]! *= inv;
}

export function relRmse(a: Float64Array, b: Float64Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    num += d * d;
    den += b[i]! * b[i]!;
  }
  return Math.sqrt(num / a.length) / (Math.sqrt(den / a.length) + 1e-12);
}

export function xcor(a: Float64Array, b: Float64Array): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= a.length;
  mb /= b.length;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  return dot / (Math.sqrt(na * nb) + 1e-12);
}
