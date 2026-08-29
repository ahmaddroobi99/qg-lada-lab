import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-line bg-elevated px-2 py-0.5 font-mono text-xs uppercase tracking-[0.14em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
