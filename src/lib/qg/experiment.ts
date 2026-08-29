import { ensembleMean, hybridResample, observeVelocity, relRmse, stochasticEnkf, xcor } from "./enkf";
import { advectTracers, BarotropicQG, bilinear } from "./model";
import { type SimConfig } from "./params";
import { Rng } from "./rng";

const TWO_PI = 2 * Math.PI;

export type HistoryPoint = {
  t: number;
  xcorW: number;
  xcorH: number;
  xcorF: number;
  rmseW: number;
  rmseH: number;
  rmseF: number;
  energy: number;
  ess: number;
};

export type FrameView = {
  t: number;
  step: number;
  n: number;
  psiTruth: Uint8Array;
  psiWhere: Uint8Array;
  psiHybrid: Uint8Array;
  psiFree: Uint8Array;
  qTruth: Uint8Array;
  tracers: number[][];
  vmin: number;
  vmax: number;
  metrics: HistoryPoint;
  history: HistoryPoint[];
};

function quantize(src: Float64Array, vmin: number, vmax: number, dst: Uint8Array): void {
  const s = 255 / (vmax - vmin + 1e-12);
  for (let i = 0; i < src.length; i++) {
    let v = (src[i]! - vmin) * s;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    dst[i] = v;
  }
}

function percentileAbs(field: Float64Array, p: number): number {
  const a = Array.from(field, (x) => Math.abs(x));
  a.sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
  return Math.max(a[i]!, 1e-6);
}

export class TwinExperiment {
  cfg: SimConfig;
  model: BarotropicQG;
  rng: Rng;
  qTruth: Float64Array;
  qWhere: Float64Array;
  qHybrid: Float64Array;
  qFree: Float64Array;
  mean: Float64Array;
  psiT: Float64Array;
  psiW: Float64Array;
  psiH: Float64Array;
  psiF: Float64Array;
  xs: Float64Array;
  ys: Float64Array;
  uTmp: Float64Array;
  vTmp: Float64Array;
  yTrue: Float64Array;
  yW: Float64Array;
  yH: Float64Array;
  yEnsW: Float64Array;
  yEnsH: Float64Array;
  d: Float64Array;
  qWork: Float64Array;
  u8T: Uint8Array;
  u8W: Uint8Array;
  u8H: Uint8Array;
  u8F: Uint8Array;
  u8Q: Uint8Array;
  t = 0;
  stepCount = 0;
  limPsi = 1;
  history: HistoryPoint[] = [];
  lastEss = 1;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.model = new BarotropicQG(cfg.n);
    this.rng = new Rng(cfg.seed);
    const n2 = cfg.n * cfg.n;
    this.qTruth = new Float64Array(n2);
    this.qWhere = new Float64Array(cfg.ne * n2);
    this.qHybrid = new Float64Array(cfg.ne * n2);
    this.qFree = new Float64Array(cfg.ne * n2);
    this.mean = new Float64Array(n2);
    this.psiT = new Float64Array(n2);
    this.psiW = new Float64Array(n2);
    this.psiH = new Float64Array(n2);
    this.psiF = new Float64Array(n2);
    this.xs = new Float64Array(cfg.tracers);
    this.ys = new Float64Array(cfg.tracers);
    this.uTmp = new Float64Array(cfg.tracers);
    this.vTmp = new Float64Array(cfg.tracers);
    this.yTrue = new Float64Array(cfg.tracers * 2);
    this.yW = new Float64Array(cfg.tracers * 2);
    this.yH = new Float64Array(cfg.tracers * 2);
    this.yEnsW = new Float64Array(cfg.ne * cfg.tracers * 2);
    this.yEnsH = new Float64Array(cfg.ne * cfg.tracers * 2);
    this.d = new Float64Array(cfg.tracers * 2);
    this.qWork = new Float64Array(n2);
    this.u8T = new Uint8Array(n2);
    this.u8W = new Uint8Array(n2);
    this.u8H = new Uint8Array(n2);
    this.u8F = new Uint8Array(n2);
    this.u8Q = new Uint8Array(n2);
    this.reset(cfg);
  }

  reset(cfg: SimConfig): void {
    if (cfg.n !== this.model.n) {
      this.model = new BarotropicQG(cfg.n);
    }
    this.cfg = cfg;
    this.model.applyConfig(cfg);
    this.rng = new Rng(cfg.seed);
    const n = cfg.n;
    const n2 = n * n;
    const ne = cfg.ne;
    const L = cfg.tracers;
    if (this.qTruth.length !== n2) {
      this.qTruth = new Float64Array(n2);
      this.mean = new Float64Array(n2);
      this.psiT = new Float64Array(n2);
      this.psiW = new Float64Array(n2);
      this.psiH = new Float64Array(n2);
      this.psiF = new Float64Array(n2);
      this.qWork = new Float64Array(n2);
      this.u8T = new Uint8Array(n2);
      this.u8W = new Uint8Array(n2);
      this.u8H = new Uint8Array(n2);
      this.u8F = new Uint8Array(n2);
      this.u8Q = new Uint8Array(n2);
    }
    if (this.qWhere.length !== ne * n2) {
      this.qWhere = new Float64Array(ne * n2);
      this.qHybrid = new Float64Array(ne * n2);
      this.qFree = new Float64Array(ne * n2);
    }
    if (this.xs.length !== L) {
      this.xs = new Float64Array(L);
      this.ys = new Float64Array(L);
      this.uTmp = new Float64Array(L);
      this.vTmp = new Float64Array(L);
      this.yTrue = new Float64Array(L * 2);
      this.yW = new Float64Array(L * 2);
      this.yH = new Float64Array(L * 2);
      this.d = new Float64Array(L * 2);
    }
    if (this.yEnsW.length !== ne * L * 2) {
      this.yEnsW = new Float64Array(ne * L * 2);
      this.yEnsH = new Float64Array(ne * L * 2);
    }

    const q0 = this.model.kolmogorov(this.rng, cfg.e0, cfg.kf);
    this.qTruth.set(q0);
    for (let i = 0; i < cfg.spin; i++) this.model.rk4(this.qTruth, cfg.dt);

    const amp = cfg.ensAmp;
    for (let e = 0; e < ne; e++) {
      const noise = this.model.kolmogorov(this.rng, cfg.e0, cfg.kf + this.rng.uniform(-1, 1));
      const off = e * n2;
      for (let s = 0; s < n2; s++) {
        const v = (1 - amp) * this.qTruth[s]! + amp * noise[s]!;
        this.qWhere[off + s] = v;
        this.qHybrid[off + s] = v;
        this.qFree[off + s] = v;
      }
    }

    const nside = Math.ceil(Math.sqrt(L));
    let p = 0;
    for (let j = 0; j < nside && p < L; j++) {
      for (let i = 0; i < nside && p < L; i++) {
        const x = 0.15 + ((TWO_PI - 0.3) * i) / Math.max(nside - 1, 1) + this.rng.uniform(-0.08, 0.08);
        const y = 0.15 + ((TWO_PI - 0.3) * j) / Math.max(nside - 1, 1) + this.rng.uniform(-0.08, 0.08);
        this.xs[p] = ((x % TWO_PI) + TWO_PI) % TWO_PI;
        this.ys[p] = ((y % TWO_PI) + TWO_PI) % TWO_PI;
        p += 1;
      }
    }

    this.t = 0;
    this.stepCount = 0;
    this.history = [];
    this.lastEss = ne;
    this.model.invert(this.qTruth);
    this.limPsi = percentileAbs(this.model.psi, 0.98);
    this.snapshot();
  }

  applyConfig(cfg: SimConfig): void {
    if (cfg.n !== this.cfg.n || cfg.ne !== this.cfg.ne || cfg.tracers !== this.cfg.tracers || cfg.seed !== this.cfg.seed) {
      this.reset(cfg);
      return;
    }
    this.cfg = cfg;
    this.model.applyConfig(cfg);
  }

  private advanceEnsemble(ens: Float64Array): void {
    const { n, ne, dt } = this.cfg;
    const n2 = n * n;
    const q = this.qWork;
    for (let e = 0; e < ne; e++) {
      const off = e * n2;
      q.set(ens.subarray(off, off + n2));
      this.model.rk4(q, dt);
      ens.set(q, off);
    }
  }

  private collectY(ens: Float64Array, yEns: Float64Array): void {
    const { n, ne, tracers: L } = this.cfg;
    const n2 = n * n;
    const nobs = L * 2;
    const q = this.qWork;
    for (let e = 0; e < ne; e++) {
      q.set(ens.subarray(e * n2, e * n2 + n2));
      observeVelocity(this.model, q, n, this.xs, this.ys, this.uTmp, this.vTmp, yEns.subarray(e * nobs, e * nobs + nobs));
    }
  }

  step(): FrameView {
    const c = this.cfg;
    this.model.rk4(this.qTruth, c.dt);
    this.advanceEnsemble(this.qWhere);
    if (c.hybrid) this.advanceEnsemble(this.qHybrid);
    this.advanceEnsemble(this.qFree);

    this.model.invert(this.qTruth);
    advectTracers(this.xs, this.ys, this.model.u, this.model.v, c.n, c.dt, this.uTmp, this.vTmp);

    this.stepCount += 1;
    this.t += c.dt;

    if (this.stepCount % Math.max(1, c.assimilateEvery) === 0) {
      bilinear(this.model.u, c.n, this.xs, this.ys, this.uTmp);
      bilinear(this.model.v, c.n, this.xs, this.ys, this.vTmp);
      const L = c.tracers;
      for (let i = 0; i < L; i++) {
        this.yTrue[i] = this.uTmp[i]!;
        this.yTrue[L + i] = this.vTmp[i]!;
        this.d[i] = this.yTrue[i]! + this.rng.normal(0, c.sigmaO);
        this.d[L + i] = this.yTrue[L + i]! + this.rng.normal(0, c.sigmaO);
      }
      this.collectY(this.qWhere, this.yEnsW);
      stochasticEnkf(
        this.qWhere,
        c.ne,
        c.n,
        this.yEnsW,
        this.d,
        c.sigmaO,
        this.xs,
        this.ys,
        c.locRadius,
        c.localize,
        c.inflation,
        c.stochastic,
        this.rng,
      );
      if (c.hybrid) {
        this.collectY(this.qHybrid, this.yEnsH);
        stochasticEnkf(
          this.qHybrid,
          c.ne,
          c.n,
          this.yEnsH,
          this.d,
          c.sigmaO,
          this.xs,
          this.ys,
          c.locRadius,
          c.localize,
          c.inflation,
          c.stochastic,
          this.rng,
        );
        this.collectY(this.qHybrid, this.yEnsH);
        this.lastEss = hybridResample(
          this.qHybrid,
          c.ne,
          c.n,
          this.yEnsH,
          this.d,
          c.sigmaO,
          c.essThreshold,
          this.rng,
        );
      }
    }

    return this.snapshot();
  }

  snapshot(): FrameView {
    const c = this.cfg;
    const n2 = c.n * c.n;
    this.model.invert(this.qTruth);
    this.psiT.set(this.model.psi);
    this.qWork.set(this.qTruth);

    ensembleMean(this.qWhere, c.ne, c.n, this.mean);
    this.model.invert(this.mean);
    this.psiW.set(this.model.psi);

    if (c.hybrid) {
      ensembleMean(this.qHybrid, c.ne, c.n, this.mean);
      this.model.invert(this.mean);
      this.psiH.set(this.model.psi);
    } else {
      this.psiH.set(this.psiW);
    }

    ensembleMean(this.qFree, c.ne, c.n, this.mean);
    this.model.invert(this.mean);
    this.psiF.set(this.model.psi);

    const p98 = percentileAbs(this.psiT, 0.98);
    this.limPsi = 0.92 * this.limPsi + 0.08 * p98;
    const lim = this.limPsi;

    quantize(this.psiT, -lim, lim, this.u8T);
    quantize(this.psiW, -lim, lim, this.u8W);
    quantize(this.psiH, -lim, lim, this.u8H);
    quantize(this.psiF, -lim, lim, this.u8F);
    this.model.invert(this.qTruth);
    const qlim = percentileAbs(this.qTruth, 0.98);
    quantize(this.qTruth, -qlim, qlim, this.u8Q);

    const metrics: HistoryPoint = {
      t: this.t,
      xcorW: xcor(this.psiW, this.psiT),
      xcorH: xcor(this.psiH, this.psiT),
      xcorF: xcor(this.psiF, this.psiT),
      rmseW: relRmse(this.psiW, this.psiT),
      rmseH: relRmse(this.psiH, this.psiT),
      rmseF: relRmse(this.psiF, this.psiT),
      energy: this.model.energy(this.qTruth),
      ess: this.lastEss / c.ne,
    };
    this.history.push(metrics);
    if (this.history.length > 240) this.history.splice(0, this.history.length - 240);

    const tracers: number[][] = [];
    for (let i = 0; i < c.tracers; i++) tracers.push([this.xs[i]!, this.ys[i]!]);

    void n2;
    return {
      t: this.t,
      step: this.stepCount,
      n: c.n,
      psiTruth: this.u8T,
      psiWhere: this.u8W,
      psiHybrid: this.u8H,
      psiFree: this.u8F,
      qTruth: this.u8Q,
      tracers,
      vmin: -lim,
      vmax: lim,
      metrics,
      history: this.history,
    };
  }
}
