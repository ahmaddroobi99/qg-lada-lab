import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FieldCanvas } from "@/components/field-canvas";
import { decodeBase64U8, fieldSlice, type FieldKey, type RunData } from "@/lib/run-data";
import { formatNum } from "@/lib/utils";

const FIELD_LABEL: Record<FieldKey, string> = {
  psi_truth: "Truth · ψ",
  psi_where: "WHERE EnKF · ψ",
  psi_hybrid: "Hybrid EnKF–PF · ψ",
  psi_free: "Free run · ψ",
  q_truth: "Truth · q",
};

type Layout = "triple" | "truth-where" | "where-free";

export function ReplayStudio({ data }: { data: RunData }) {
  const n = data.fields.n;
  const nFrames = data.fields.n_frames;
  const decoded = useMemo(
    () => ({
      psi_truth: decodeBase64U8(data.fields.psi_truth),
      psi_where: decodeBase64U8(data.fields.psi_where),
      psi_hybrid: decodeBase64U8(data.fields.psi_hybrid),
      psi_free: decodeBase64U8(data.fields.psi_free),
      q_truth: decodeBase64U8(data.fields.q_truth),
    }),
    [data],
  );

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showTracers, setShowTracers] = useState(true);
  const [layout, setLayout] = useState<Layout>("triple");
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % nFrames);
    }, 110);
    return () => window.clearInterval(id);
  }, [playing, nFrames]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowRight") {
        setPlaying(false);
        setFrame((f) => Math.min(nFrames - 1, f + 1));
      } else if (e.code === "ArrowLeft") {
        setPlaying(false);
        setFrame((f) => Math.max(0, f - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nFrames]);

  const tracers = data.tracers[frame];
  const t = data.times[frame] ?? 0;
  const slice = (key: FieldKey) => fieldSlice(decoded[key], frame, n);

  const panels: FieldKey[] =
    layout === "triple"
      ? ["psi_truth", "psi_where", "psi_hybrid"]
      : layout === "truth-where"
        ? ["psi_truth", "psi_where"]
        : ["psi_where", "psi_free"];

  return (
    <section className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-subtle">
            Identical-twin replay
          </p>
          <h2 className="font-display text-2xl text-fg md:text-3xl">Streamfunction from drifters</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["triple", "Truth / WHERE / Hybrid"],
              ["truth-where", "Truth vs WHERE"],
              ["where-free", "WHERE vs free run"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={layout === id ? "default" : "outline"}
              onClick={() => setLayout(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={
          panels.length === 3
            ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
            : "grid grid-cols-1 gap-3 sm:grid-cols-2"
        }
      >
        {panels.map((key) => (
          <FieldCanvas
            key={key}
            values={slice(key)}
            n={n}
            tracers={key === "psi_free" ? undefined : tracers}
            showTracers={showTracers && key !== "psi_free"}
            label={FIELD_LABEL[key]}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="subtle"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Restart"
            onClick={() => {
              setFrame(0);
              setPlaying(true);
            }}
          >
            <RotateCcw />
          </Button>
          <div className="min-w-40 flex-1">
            <Slider
              min={0}
              max={nFrames - 1}
              step={1}
              value={[frame]}
              onValueChange={(v) => {
                setPlaying(false);
                setFrame(v[0] ?? 0);
              }}
              aria-label="Time"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowTracers((s) => !s)}
            className="h-11 rounded-sm border border-line px-3 text-xs text-muted hover:text-fg"
          >
            Tracers {showTracers ? "on" : "off"}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 font-mono text-xs text-muted sm:grid-cols-4 md:grid-cols-6">
          <Stat label="t" value={formatNum(t, 2)} />
          <Stat label="WHERE XCOR" value={formatNum(data.metrics.xcor_where[frame], 3)} />
          <Stat label="WHERE RMSE" value={formatNum(data.metrics.rmse_where[frame], 3)} />
          <Stat label="Hybrid XCOR" value={formatNum(data.metrics.xcor_hybrid[frame], 3)} />
          <Stat label="Free XCOR" value={formatNum(data.metrics.xcor_free[frame], 3)} />
          <Stat label="Energy" value={formatNum(data.metrics.energy_truth[frame], 3)} />
        </dl>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-sm text-fg">{value}</dd>
    </div>
  );
}
