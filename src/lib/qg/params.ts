export const TERM_IDS = ["jacobian", "beta", "drag", "visc", "forcing", "helmholtz"] as const;
export type TermId = (typeof TERM_IDS)[number];

export type SimConfig = {
  n: 16 | 32;
  ne: number;
  tracers: number;
  dt: number;
  spin: number;
  seed: number;
  mu: number;
  beta: number;
  drag: number;
  nu: number;
  pVisc: number;
  kf: number;
  f0: number;
  e0: number;
  ensAmp: number;
  sigmaO: number;
  inflation: number;
  locRadius: number;
  localize: boolean;
  stochastic: boolean;
  hybrid: boolean;
  essThreshold: number;
  assimilateEvery: number;
  terms: Record<TermId, boolean>;
};

export const TERM_META: Record<TermId, { short: string; tex: string; hint: string }> = {
  jacobian: { short: "J(ψ,q)", tex: "J(ψ, q)", hint: "Nonlinear advection" },
  beta: { short: "β ∂ψ/∂x", tex: "β ∂ψ/∂x", hint: "Rossby waves" },
  drag: { short: "d q", tex: "d q", hint: "Linear Rayleigh drag" },
  visc: { short: "ν (−∇²)ᵖ q", tex: "ν (−∇²)ᵖ q", hint: "Hyperviscosity" },
  forcing: { short: "F", tex: "F", hint: "Kolmogorov sinusoid" },
  helmholtz: { short: "μ ψ", tex: "μ ψ", hint: "Deformation radius in q = ∇²ψ − μψ" },
};

const ON: Record<TermId, boolean> = {
  jacobian: true,
  beta: true,
  drag: true,
  visc: true,
  forcing: true,
  helmholtz: true,
};

export const DEFAULT_CONFIG: SimConfig = {
  n: 16,
  ne: 12,
  tracers: 20,
  dt: 0.03,
  spin: 60,
  seed: 2025,
  mu: 0.05,
  beta: 0.05,
  drag: 0.08,
  nu: 3.5e-4,
  pVisc: 2,
  kf: 4,
  f0: 0.16,
  e0: 0.8,
  ensAmp: 0.55,
  sigmaO: 0.04,
  inflation: 1.08,
  locRadius: 1.55,
  localize: true,
  stochastic: true,
  hybrid: false,
  essThreshold: 0.55,
  assimilateEvery: 10,
  terms: { ...ON },
};

export type Preset = {
  id: string;
  label: string;
  hint: string;
  patch: Partial<Omit<SimConfig, "terms">> & { terms?: Partial<Record<TermId, boolean>> };
};

export const PRESETS: Preset[] = [
  {
    id: "thesis",
    label: "Thesis-like",
    hint: "All terms on, WHERE + hybrid, moderate noise",
    patch: {},
  },
  {
    id: "fine",
    label: "N = 32",
    hint: "Demo grid from the committed run (heavier)",
    patch: { n: 32, ne: 16, tracers: 32, dt: 0.02 },
  },
  {
    id: "linear",
    label: "Linear Rossby",
    hint: "Drop J(ψ,q) — EnKF on linear dynamics",
    patch: { terms: { jacobian: false } },
  },
  {
    id: "fplane",
    label: "f-plane",
    hint: "β = 0, no planetary vorticity gradient",
    patch: { terms: { beta: false }, beta: 0 },
  },
  {
    id: "unforced",
    label: "Decaying",
    hint: "F = 0, turbulence runs down",
    patch: { terms: { forcing: false }, f0: 0 },
  },
  {
    id: "poisson",
    label: "Poisson q = ∇²ψ",
    hint: "Turn off the Helmholtz μ term",
    patch: { terms: { helmholtz: false }, mu: 0 },
  },
  {
    id: "sparse",
    label: "Sparse drifters",
    hint: "L = 8, localisation still on",
    patch: { tracers: 8, locRadius: 2.2 },
  },
  {
    id: "noloc",
    label: "No localisation",
    hint: "Global EnKF — noisy small scales",
    patch: { localize: false },
  },
  {
    id: "noisy",
    label: "Noisy obs",
    hint: "σ_o = 0.15, stronger inflation",
    patch: { sigmaO: 0.15, inflation: 1.12 },
  },
  {
    id: "hybrid",
    label: "Hybrid EnKF–PF",
    hint: "Systematic resampling after WHERE — often worse on QG",
    patch: { hybrid: true },
  },
  {
    id: "enkf-only",
    label: "WHERE only",
    hint: "Skip hybrid resampling (default)",
    patch: { hybrid: false },
  },
];

export function mergeConfig(
  base: SimConfig,
  patch: Preset["patch"] | Partial<SimConfig>,
): SimConfig {
  const terms = { ...base.terms, ...("terms" in patch && patch.terms ? patch.terms : {}) };
  return { ...base, ...patch, terms };
}

export function applyPreset(id: string): SimConfig {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0]!;
  return mergeConfig(DEFAULT_CONFIG, p.patch);
}

export function equationLine(c: SimConfig): { left: string; right: string; invert: string } {
  const t = c.terms;
  const bitsL: string[] = ["∂q/∂t"];
  if (t.jacobian) bitsL.push("J(ψ, q)");
  if (t.beta) bitsL.push("β ∂ψ/∂x");
  const bitsR: string[] = [];
  if (t.forcing) bitsR.push("F");
  if (t.drag) bitsR.push("d q");
  if (t.visc) bitsR.push("ν (−∇²)ᵖ q");
  let right: string;
  if (bitsR.length === 0) right = "0";
  else if (t.forcing) {
    right = bitsR[0]!;
    for (let i = 1; i < bitsR.length; i++) right += ` − ${bitsR[i]}`;
  } else {
    right = bitsR.map((s) => `− ${s}`).join(" ");
  }
  const invert = t.helmholtz ? "q = ∇²ψ − μψ" : "q = ∇²ψ";
  return { left: bitsL.join(" + "), right, invert };
}

const STRUCTURAL: Array<keyof SimConfig> = ["n", "ne", "tracers", "seed", "spin"];

export function needsReset(a: SimConfig, b: SimConfig): boolean {
  return STRUCTURAL.some((k) => a[k] !== b[k]);
}

export function parseConfigSearch(search: string): Partial<SimConfig> | null {
  if (!search || search === "?") return null;
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Partial<SimConfig> = {};
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const n = num("n");
  if (n === 16 || n === 32) out.n = n;
  const keys: Array<[keyof SimConfig, string]> = [
    ["ne", "ne"],
    ["tracers", "L"],
    ["dt", "dt"],
    ["seed", "seed"],
    ["mu", "mu"],
    ["beta", "beta"],
    ["drag", "d"],
    ["nu", "nu"],
    ["kf", "kf"],
    ["f0", "f0"],
    ["sigmaO", "so"],
    ["inflation", "inf"],
    ["locRadius", "loc"],
    ["ensAmp", "amp"],
    ["assimilateEvery", "every"],
  ];
  for (const [ck, qk] of keys) {
    const v = num(qk);
    if (v !== undefined) (out as Record<string, number>)[ck] = v;
  }
  const flag = (k: string) => {
    const v = q.get(k);
    if (v === "0" || v === "1") return v === "1";
    return undefined;
  };
  const loc = flag("localize");
  if (loc !== undefined) out.localize = loc;
  const st = flag("stoch");
  if (st !== undefined) out.stochastic = st;
  const hy = flag("hybrid");
  if (hy !== undefined) out.hybrid = hy;
  const terms: Partial<Record<TermId, boolean>> = {};
  for (const id of TERM_IDS) {
    const v = flag(id.slice(0, 3));
    if (v !== undefined) terms[id] = v;
  }
  if (Object.keys(terms).length) out.terms = terms as SimConfig["terms"];
  return out;
}

export function configToSearch(c: SimConfig): string {
  const d = DEFAULT_CONFIG;
  const q = new URLSearchParams();
  if (c.n !== d.n) q.set("n", String(c.n));
  if (c.ne !== d.ne) q.set("ne", String(c.ne));
  if (c.tracers !== d.tracers) q.set("L", String(c.tracers));
  if (c.dt !== d.dt) q.set("dt", String(c.dt));
  if (c.seed !== d.seed) q.set("seed", String(c.seed));
  if (c.mu !== d.mu) q.set("mu", String(c.mu));
  if (c.beta !== d.beta) q.set("beta", String(c.beta));
  if (c.drag !== d.drag) q.set("d", String(c.drag));
  if (c.nu !== d.nu) q.set("nu", String(c.nu));
  if (c.kf !== d.kf) q.set("kf", String(c.kf));
  if (c.f0 !== d.f0) q.set("f0", String(c.f0));
  if (c.sigmaO !== d.sigmaO) q.set("so", String(c.sigmaO));
  if (c.inflation !== d.inflation) q.set("inf", String(c.inflation));
  if (c.locRadius !== d.locRadius) q.set("loc", String(c.locRadius));
  if (c.localize !== d.localize) q.set("localize", c.localize ? "1" : "0");
  if (c.stochastic !== d.stochastic) q.set("stoch", c.stochastic ? "1" : "0");
  if (c.hybrid !== d.hybrid) q.set("hybrid", c.hybrid ? "1" : "0");
  for (const id of TERM_IDS) {
    if (c.terms[id] !== d.terms[id]) q.set(id.slice(0, 3), c.terms[id] ? "1" : "0");
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
