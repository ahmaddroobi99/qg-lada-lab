import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-line bg-elevated transition-colors duration-[var(--motion-quick,150ms)] data-[state=checked]:border-accent data-[state=checked]:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-fg shadow-[var(--shadow-soft)] transition-transform duration-[var(--motion-quick,150ms)] data-[state=checked]:translate-x-5 data-[state=checked]:bg-accent-fg" />
    </SwitchPrimitive.Root>
  );
}
