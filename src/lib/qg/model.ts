import { SpectralGrid } from "./fft";
import type { SimConfig } from "./params";
import { Rng } from "./rng";

const TWO_PI = 2 * Math.PI;

export class BarotropicQG {
  n: number;
  grid: SpectralGrid;
  mu = 0.05;
  beta = 0.05;
  drag = 0.08;
  nu = 3.5e-4;
  pVisc = 2;
  kf = 4;
  f0 = 0.16;
  aJ = 1;
  aBeta = 1;
  aDrag = 1;
  aVisc = 1;
  aF = 1;
  aMu = 1;

  readonly invhel: Float64Array;
  readonly diss: Float64Array;
  readonly forceRe: Float64Array;
  readonly forceIm: Float64Array;
  readonly qhRe: Float64Array;
  readonly qhIm: Float64Array;
  readonly psi: Float64Array;
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly qx: Float64Array;
  readonly qy: Float64Array;
  readonly jac: Float64Array;
  readonly rhsBuf: Float64Array;
  readonly k1: Float64Array;
  readonly k2: Float64Array;
  readonly k3: Float64Array;
  readonly k4: Float64Array;
  readonly qtmp: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.grid = new SpectralGrid(n);
    const m = n * this.grid.nkx;
    const n2 = n * n;
    this.invhel = new Float64Array(m);
    this.diss = new Float64Array(m);
    this.forceRe = new Float64Array(m);
    this.forceIm = new Float64Array(m);
    this.qhRe = new Float64Array(m);
    this.qhIm = new Float64Array(m);
    this.psi = new Float64Array(n2);
    this.u = new Float64Array(n2);
    this.v = new Float64Array(n2);
    this.qx = new Float64Array(n2);
    this.qy = new Float64Array(n2);
    this.jac = new Float64Array(n2);
    this.rhsBuf = new Float64Array(n2);
    this.k1 = new Float64Array(n2);
    this.k2 = new Float64Array(n2);
    this.k3 = new Float64Array(n2);
    this.k4 = new Float64Array(n2);
    this.qtmp = new Float64Array(n2);
  }

  applyConfig(c: SimConfig): void {
    this.mu = c.mu;
    this.beta = c.beta;
    this.drag = c.drag;
    this.nu = c.nu;
    this.pVisc = c.pVisc;
    this.kf = c.kf;
    this.f0 = c.f0;
    this.aJ = c.terms.jacobian ? 1 : 0;
    this.aBeta = c.terms.beta ? 1 : 0;
    this.aDrag = c.terms.drag ? 1 : 0;
    this.aVisc = c.terms.visc ? 1 : 0;
    this.aF = c.terms.forcing ? 1 : 0;
    this.aMu = c.terms.helmholtz ? 1 : 0;
    this.rebuildOperators();
  }

  private rebuildOperators(): void {
    const { n, grid } = this;
    const { nkx, ksq, mask, specRe, specIm } = grid;
    const mu = this.aMu * this.mu;
    for (let k = 0; k < ksq.length; k++) {
      const den = ksq[k]! + mu;
      this.invhel[k] = den > 1e-14 ? -1 / den : 0;
      this.diss[k] = this.aDrag * this.drag + this.aVisc * this.nu * ksq[k]! ** this.pVisc;
    }
    this.invhel[0] = 0;

    const n2 = n * n;
    const force = this.jac; // reuse
    const dx = TWO_PI / n;
    const kf = this.kf;
    const f0 = this.aF * this.f0;
    for (let j = 0; j < n; j++) {
      const y = j * dx;
      for (let i = 0; i < n; i++) {
        const x = i * dx;
        force[j * n + i] =
          f0 *
          (Math.sin(kf * x) * Math.cos(kf * y) +
            0.35 * Math.sin((kf + 1) * x) * Math.sin((kf - 1) * y));
      }
    }
    grid.rfft2(force);
    for (let k = 0; k < nkx * n; k++) {
      this.forceRe[k] = specRe[k]! * mask[k]!;
      this.forceIm[k] = specIm[k]! * mask[k]!;
    }
    void n2;
  }

  invert(q: Float64Array): void {
    const { grid, invhel, qhRe, qhIm, psi, u, v } = this;
    const { specRe, specIm, kx, ky } = grid;
    grid.rfft2(q);
    qhRe.set(specRe);
    qhIm.set(specIm);
    for (let k = 0; k < specRe.length; k++) {
      specRe[k] = qhRe[k]! * invhel[k]!;
      specIm[k] = qhIm[k]! * invhel[k]!;
    }
    grid.irfft2(psi);
    for (let k = 0; k < specRe.length; k++) {
      const pr = qhRe[k]! * invhel[k]!;
      const pi = qhIm[k]! * invhel[k]!;
      const kyv = ky[k]!;
      specRe[k] = kyv * pi;
      specIm[k] = -kyv * pr;
    }
    grid.irfft2(u);
    for (let k = 0; k < specRe.length; k++) {
      const pr = qhRe[k]! * invhel[k]!;
      const pi = qhIm[k]! * invhel[k]!;
      const kxv = kx[k]!;
      specRe[k] = -kxv * pi;
      specIm[k] = kxv * pr;
    }
    grid.irfft2(v);
  }

  rhs(q: Float64Array, out: Float64Array): void {
    this.invert(q);
    const { grid, qhRe, qhIm, u, v, qx, qy, jac, diss, forceRe, forceIm } = this;
    const { specRe, specIm, kx, ky } = grid;
    for (let k = 0; k < specRe.length; k++) {
      const qr = qhRe[k]!;
      const qi = qhIm[k]!;
      specRe[k] = -kx[k]! * qi;
      specIm[k] = kx[k]! * qr;
    }
    grid.irfft2(qx);
    for (let k = 0; k < specRe.length; k++) {
      const qr = qhRe[k]!;
      const qi = qhIm[k]!;
      specRe[k] = -ky[k]! * qi;
      specIm[k] = ky[k]! * qr;
    }
    grid.irfft2(qy);
    const n2 = q.length;
    if (this.aJ !== 0) {
      for (let i = 0; i < n2; i++) jac[i] = u[i]! * qx[i]! + v[i]! * qy[i]!;
    } else {
      jac.fill(0);
    }
    grid.rfft2(jac);
    for (let k = 0; k < specRe.length; k++) {
      specRe[k] = -specRe[k]! - diss[k]! * qhRe[k]! + forceRe[k]!;
      specIm[k] = -specIm[k]! - diss[k]! * qhIm[k]! + forceIm[k]!;
    }
    grid.irfft2(out);
    if (this.aBeta !== 0) {
      const b = this.beta;
      for (let i = 0; i < n2; i++) out[i]! -= b * v[i]!;
    }
  }

  rk4(q: Float64Array, dt: number): void {
    const { k1, k2, k3, k4, qtmp } = this;
    const n2 = q.length;
    this.rhs(q, k1);
    for (let i = 0; i < n2; i++) qtmp[i] = q[i]! + 0.5 * dt * k1[i]!;
    this.rhs(qtmp, k2);
    for (let i = 0; i < n2; i++) qtmp[i] = q[i]! + 0.5 * dt * k2[i]!;
    this.rhs(qtmp, k3);
    for (let i = 0; i < n2; i++) qtmp[i] = q[i]! + dt * k3[i]!;
    this.rhs(qtmp, k4);
    const s = dt / 6;
    for (let i = 0; i < n2; i++) {
      q[i] = q[i]! + s * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
    }
  }

  energy(q: Float64Array): number {
    this.invert(q);
    const { u, v } = this;
    let s = 0;
    for (let i = 0; i < u.length; i++) s += u[i]! * u[i]! + v[i]! * v[i]!;
    return 0.5 * s / u.length;
  }

  kolmogorov(rng: Rng, e0: number, k0: number): Float64Array {
    const { grid, qtmp } = this;
    const { specRe, specIm, kabs, mask } = grid;
    specRe.fill(0);
    specIm.fill(0);
    for (let k = 0; k < specRe.length; k++) {
      const amp = (Math.exp(-((kabs[k]! - k0) ** 2) / (2 * 1.6 ** 2)) / (kabs[k]! + 0.3) ** 1.15) * mask[k]!;
      const ph = rng.uniform(0, TWO_PI);
      specRe[k] = amp * Math.cos(ph);
      specIm[k] = amp * Math.sin(ph);
    }
    specRe[0] = 0;
    specIm[0] = 0;
    grid.irfft2(qtmp);
    const e = this.energy(qtmp);
    if (e > 1e-16) {
      const s = Math.sqrt(e0 / e);
      for (let i = 0; i < qtmp.length; i++) qtmp[i]! *= s;
    }
    return Float64Array.from(qtmp);
  }
}

export function bilinear(field: Float64Array, n: number, xs: Float64Array, ys: Float64Array, out: Float64Array): void {
  const L = xs.length;
  for (let p = 0; p < L; p++) {
    const gx = ((xs[p]! % TWO_PI) / TWO_PI) * n;
    const gy = ((ys[p]! % TWO_PI) / TWO_PI) * n;
    const gxu = gx < 0 ? gx + n : gx;
    const gyu = gy < 0 ? gy + n : gy;
    const i0 = Math.floor(gxu) % n;
    const j0 = Math.floor(gyu) % n;
    const i1 = (i0 + 1) % n;
    const j1 = (j0 + 1) % n;
    const fx = gxu - Math.floor(gxu);
    const fy = gyu - Math.floor(gyu);
    const f00 = field[j0 * n + i0]!;
    const f10 = field[j0 * n + i1]!;
    const f01 = field[j1 * n + i0]!;
    const f11 = field[j1 * n + i1]!;
    out[p] = f00 * (1 - fx) * (1 - fy) + f10 * fx * (1 - fy) + f01 * (1 - fx) * fy + f11 * fx * fy;
  }
}

export function advectTracers(
  xs: Float64Array,
  ys: Float64Array,
  u: Float64Array,
  v: Float64Array,
  n: number,
  dt: number,
  uTmp: Float64Array,
  vTmp: Float64Array,
): void {
  const L = xs.length;
  bilinear(u, n, xs, ys, uTmp);
  bilinear(v, n, xs, ys, vTmp);
  const x2 = new Float64Array(L);
  const y2 = new Float64Array(L);
  for (let p = 0; p < L; p++) {
    x2[p] = (xs[p]! + 0.5 * dt * uTmp[p]!) % TWO_PI;
    y2[p] = (ys[p]! + 0.5 * dt * vTmp[p]!) % TWO_PI;
    if (x2[p]! < 0) x2[p]! += TWO_PI;
    if (y2[p]! < 0) y2[p]! += TWO_PI;
  }
  bilinear(u, n, x2, y2, uTmp);
  bilinear(v, n, x2, y2, vTmp);
  for (let p = 0; p < L; p++) {
    let x = (xs[p]! + dt * uTmp[p]!) % TWO_PI;
    let y = (ys[p]! + dt * vTmp[p]!) % TWO_PI;
    if (x < 0) x += TWO_PI;
    if (y < 0) y += TWO_PI;
    xs[p] = x;
    ys[p] = y;
  }
}
