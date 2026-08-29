import { useEffect, useRef } from "react";
import { paintField } from "@/lib/colormap";
import { cn } from "@/lib/utils";

type Props = {
  values: Uint8Array;
  n: number;
  tracers?: number[][];
  showTracers?: boolean;
  label: string;
  className?: string;
};

export function FieldCanvas({ values, n, tracers, showTracers = true, label, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintField(ctx, values, n, tracers, showTracers);
  }, [values, n, tracers, showTracers]);

  return (
    <figure className={cn("relative overflow-hidden rounded-md bg-elevated", className)}>
      <canvas ref={canvasRef} className="block aspect-square w-full" />
      <figcaption className="pointer-events-none absolute left-0 right-0 top-0 bg-bg/70 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-fg">
        {label}
      </figcaption>
    </figure>
  );
}
