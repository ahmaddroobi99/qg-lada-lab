import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  className?: string;
};

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => (Math.abs(v) >= 0.01 && Math.abs(v) < 100 ? v.toFixed(step < 0.01 ? 4 : 2) : String(v)),
  hint,
  className,
}: Props) {
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-xs text-muted">{label}</label>
        <span className="font-mono text-xs tabular-nums text-fg">{format(value)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
