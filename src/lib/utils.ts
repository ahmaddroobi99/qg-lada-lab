import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNum(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}
