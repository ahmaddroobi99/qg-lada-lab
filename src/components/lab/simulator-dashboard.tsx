import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link2, Pause, Play, RotateCcw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FieldCanvas } from "@/components/field-canvas";
import { ParamSlider } from "@/components/lab/param-slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TwinExperiment, type FrameView } from "@/lib/qg/experiment";
import {
  DEFAULT_CONFIG,
  PRESETS,
  TERM_IDS,
  TERM_META,
  configToSearch,
  equationLine,
  mergeConfig,
  parseConfigSearch,
  type SimConfig,
  type TermId,
} from "@/lib/qg/params";
import { cn, formatNum } from "@/lib/utils";

function cloneFrame(f: FrameView): FrameView {
  return {
    ...f,
    psiTruth: new Uint8Array(f.psiTruth),
    psiWhere: new Uint8Array(f.psiWhere),
    psiHybrid: new Uint8Array(f.psiHybrid),
    psiFree: new Uint8Array(f.psiFree),
    qTruth: new Uint8Array(f.qTruth),
    tracers: f.tracers.map((p) => [p[0]!, p[1]!]),
    history: f.history.slice(),
    metrics: { ...f.metrics },
  };
}

export function SimulatorDashboard() {
  const [cfg, setCfg] = useState<SimConfig>(DEFAULT_CONFIG);
  const [frame, setFrame] = useState<FrameView | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [showTracers, setShowTracers] = useState(true);
  const [copied, setCopied] = useState(false);
  const sim = useRef<TwinExperiment | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    const parsed = parseConfigSearch(window.location.search);
    const start = parsed ? mergeConfig(DEFAULT_CONFIG, parsed) : DEFAULT_CONFIG;
    setCfg(start);
    const exp = new TwinExperiment(start);
    sim.current = exp;
    setFrame(cloneFrame(exp.snapshot()));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const interval = cfgRef.current.n === 32 ? 160 : 80;
      if (now - last >= interval) {
        last = now;
        const exp = sim.current;
        if (exp) {
          let f = exp.step();
          for (let i = 1; i < speed; i++) f = exp.step();
          setFrame(cloneFrame(f));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function patch(p: Parameters<typeof mergeConfig>[1]) {
    setCfg((c) => {
      const n = mergeConfig(c, p);
      const exp = sim.current;
      if (exp) {
        exp.applyConfig(n);
        setFrame(cloneFrame(exp.snapshot()));
      }
      return n;
    });
  }

  function restart() {
    const exp = sim.current;
    if (!exp) return;
    exp.reset(cfg);
    setFrame(cloneFrame(exp.snapshot()));
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}${configToSearch(cfg)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const eq = equationLine(cfg);
  const m = frame?.metrics;
  const n = frame?.n ?? cfg.n;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
      <aside className="rounded-xl border border-line bg-surface p-4 md:p-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-subtle">Equation</p>
        <pre className="mt-2 overflow-x-auto font-display text-lg leading-snug text-fg">
          {eq.left} = {eq.right}
          {"\n"}
          {eq.invert}
        </pre>
        <p className="mt-2 font-mono text-xs text-subtle">ψ̂ = −q̂ / (κ²{cfg.terms.helmholtz ? " + μ" : ""})</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TERM_IDS.map((id) => (
            <TermChip
              key={id}
              id={id}
              on={cfg.terms[id]}
              onToggle={() => patch({ terms: { ...cfg.terms, [id]: !cfg.terms[id] } })}
            />
          ))}
        </div>

        <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-subtle">Presets</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              title={p.hint}
              onClick={() => {
                const ncfg = mergeConfig(DEFAULT_CONFIG, p.patch);
                setCfg(ncfg);
                sim.current?.reset(ncfg);
                if (sim.current) setFrame(cloneFrame(sim.current.snapshot()));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <Section title="Coefficients">
          <ParamSlider label="β  Rossby" value={cfg.beta} min={0} max={0.4} step={0.01} onChange={(v) => patch({ beta: v })} />
          <ParamSlider label="μ  Helmholtz" value={cfg.mu} min={0} max={0.4} step={0.01} onChange={(v) => patch({ mu: v })} />
          <ParamSlider label="d  drag" value={cfg.drag} min={0} max={0.4} step={0.01} onChange={(v) => patch({ drag: v })} />
          <ParamSlider
            label="ν  viscosity"
            value={cfg.nu}
            min={0}
            max={0.002}
            step={0.00005}
            format={(v) => v.toExponential(1)}
            onChange={(v) => patch({ nu: v })}
          />
          <ParamSlider label="k_f  forcing wavenumber" value={cfg.kf} min={1} max={8} step={1} format={(v) => String(v)} onChange={(v) => patch({ kf: v })} />
          <ParamSlider label="F₀  forcing amplitude" value={cfg.f0} min={0} max={0.5} step={0.01} onChange={(v) => patch({ f0: v })} />
          <ParamSlider label="p  hyperviscous order" value={cfg.pVisc} min={1} max={4} step={1} format={(v) => String(v)} onChange={(v) => patch({ pVisc: v })} />
        </Section>

        <Section title="Filter">
          <FlagRow label="Localisation (Gaspari–Cohn)" checked={cfg.localize} onChange={(v) => patch({ localize: v })} />
          <FlagRow label="Stochastic (perturbed obs)" checked={cfg.stochastic} onChange={(v) => patch({ stochastic: v })} />
          <FlagRow label="Hybrid EnKF–PF resample" checked={cfg.hybrid} onChange={(v) => patch({ hybrid: v })} />
          <ParamSlider label="N_e  ensemble" value={cfg.ne} min={4} max={24} step={1} format={(v) => String(v)} onChange={(v) => patch({ ne: v })} />
          <ParamSlider label="L  drifters" value={cfg.tracers} min={4} max={48} step={1} format={(v) => String(v)} onChange={(v) => patch({ tracers: v })} />
          <ParamSlider label="σ_o  obs noise" value={cfg.sigmaO} min={0.005} max={0.25} step={0.005} onChange={(v) => patch({ sigmaO: v })} />
          <ParamSlider label="Inflation" value={cfg.inflation} min={1} max={1.3} step={0.01} onChange={(v) => patch({ inflation: v })} />
          <ParamSlider label="Loc. radius" value={cfg.locRadius} min={0.4} max={3.2} step={0.05} onChange={(v) => patch({ locRadius: v })} />
          <ParamSlider
            label="Analysis every N steps"
            value={cfg.assimilateEvery}
            min={1}
            max={20}
            step={1}
            format={(v) => String(v)}
            hint={`Δt_obs ≈ ${(cfg.assimilateEvery * cfg.dt).toFixed(2)}`}
            onChange={(v) => patch({ assimilateEvery: v })}
          />
          <ParamSlider label="ESS resample threshold" value={cfg.essThreshold} min={0.2} max={1} step={0.05} onChange={(v) => patch({ essThreshold: v })} />
        </Section>

        <Section title="Numerics">
          <div className="flex gap-1.5">
            {([16, 32] as const).map((nopt) => (
              <Button key={nopt} size="sm" variant={cfg.n === nopt ? "default" : "outline"} onClick={() => patch({ n: nopt })}>
                N = {nopt}
              </Button>
            ))}
          </div>
          <ParamSlider label="Δt" value={cfg.dt} min={0.01} max={0.06} step={0.005} onChange={(v) => patch({ dt: v })} />
          <ParamSlider label="Spin-up steps" value={cfg.spin} min={0} max={200} step={10} format={(v) => String(v)} onChange={(v) => patch({ spin: v })} />
          <ParamSlider label="Ensemble mix" value={cfg.ensAmp} min={0.1} max={1} step={0.05} onChange={(v) => patch({ ensAmp: v })} />
          <ParamSlider label="Seed" value={cfg.seed} min={1} max={9999} step={1} format={(v) => String(v)} onChange={(v) => patch({ seed: v })} />
        </Section>
      </aside>

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-subtle">Live identical twin</p>
            <h2 className="font-display text-2xl text-fg md:text-3xl">Streamfunction from drifters</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="icon" variant="subtle" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button size="icon" variant="ghost" aria-label="Restart ensemble" onClick={restart}>
              <RotateCcw />
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Link2 />
              {copied ? "Copied" : "Copy config"}
            </Button>
            <button
              type="button"
              onClick={() => setShowTracers((s) => !s)}
              className="h-11 rounded-sm border border-line px-3 text-xs text-muted hover:text-fg"
            >
              Tracers {showTracers ? "on" : "off"}
            </button>
          </div>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="t" value={formatNum(m?.t ?? 0, 2)} />
          <Stat label="WHERE XCOR" value={formatNum(m?.xcorW ?? 0, 3)} hint="target > 0.9" good={(m?.xcorW ?? 0) > 0.9} />
          <Stat label="Free XCOR" value={formatNum(m?.xcorF ?? 0, 3)} />
          <Stat label="WHERE RMSE" value={formatNum(m?.rmseW ?? 0, 3)} />
        </dl>

        {frame ? (
          <div className={cn("grid gap-3", cfg.hybrid ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            <FieldCanvas values={frame.psiTruth} n={n} tracers={frame.tracers} showTracers={showTracers} label="Truth · ψ" />
            <FieldCanvas values={frame.psiWhere} n={n} tracers={frame.tracers} showTracers={showTracers} label="WHERE EnKF · ψ" />
            {cfg.hybrid ? (
              <FieldCanvas values={frame.psiHybrid} n={n} tracers={frame.tracers} showTracers={showTracers} label="Hybrid EnKF–PF · ψ" />
            ) : null}
            <FieldCanvas values={frame.psiFree} n={n} showTracers={false} label="Free run · ψ" />
          </div>
        ) : (
          <div className="h-72 animate-pulse rounded-md border border-line bg-elevated" />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">Steps / tick</span>
          {[1, 2, 4].map((s) => (
            <Button key={s} size="sm" variant={speed === s ? "default" : "outline"} onClick={() => setSpeed(s)}>
              {s}×
            </Button>
          ))}
          {cfg.n === 32 ? <Badge>N = 32 is heavier — drop to 1× if it stutters</Badge> : null}
        </div>

        {frame && frame.history.length > 2 ? (
          <div className="mt-6 rounded-lg border border-line bg-elevated p-3 md:p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-subtle">XCOR(ψ) vs time</p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={frame.history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="currentColor" className="text-line" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tick={{ fill: "#8b96a4", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#232a33" }} />
                  <YAxis domain={[-1, 1]} tick={{ fill: "#8b96a4", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#232a33" }} width={36} />
                  <Tooltip
                    contentStyle={{
                      background: "#171d26",
                      border: "1px solid #232a33",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#e6edf3",
                    }}
                    labelFormatter={(v) => `t = ${Number(v).toFixed(2)}`}
                  />
                  <Line type="monotone" dataKey="xcorW" name="WHERE" stroke="#8ea4bc" dot={false} strokeWidth={1.8} isAnimationActive={false} />
                  {cfg.hybrid ? (
                    <Line type="monotone" dataKey="xcorH" name="Hybrid" stroke="#8aa080" dot={false} strokeWidth={1.6} isAnimationActive={false} />
                  ) : null}
                  <Line type="monotone" dataKey="xcorF" name="Free" stroke="#b56a62" dot={false} strokeWidth={1.6} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 grid gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-subtle">{title}</p>
      {children}
    </section>
  );
}

function TermChip({ id, on, onToggle }: { id: TermId; on: boolean; onToggle: () => void }) {
  const meta = TERM_META[id];
  return (
    <button
      type="button"
      title={meta.hint}
      onClick={onToggle}
      className={cn(
        "h-11 rounded-sm border px-2.5 font-mono text-xs transition-colors duration-150",
        on ? "border-accent/60 bg-elevated text-fg" : "border-line text-subtle line-through",
      )}
    >
      {meta.short}
    </button>
  );
}

function FlagRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Stat({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className={cn("mt-0.5 font-display text-2xl tabular-nums", good ? "text-ok" : "text-fg")}>{value}</dd>
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
