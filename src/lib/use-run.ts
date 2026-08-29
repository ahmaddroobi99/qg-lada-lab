import { useEffect, useState } from "react";
import type { RunData } from "@/lib/run-data";

export function useRun() {
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/run.json")
      .then((r) => {
        if (!r.ok) throw new Error(`run.json ${r.status}`);
        return r.json() as Promise<RunData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load run");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
