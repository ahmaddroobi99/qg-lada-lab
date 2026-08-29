import { createFileRoute, Link } from "@tanstack/react-router";
import { ReplayStudio } from "@/components/replay-studio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunData } from "@/lib/run-data";
import { formatNum } from "@/lib/utils";
import runPayload from "@/data/run.json";

export const Route = createFileRoute("/")({
  loader: () => runPayload as RunData,
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();

  return (
    <main id="content" className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <section className="mb-10 grid gap-8 md:grid-cols-[1.4fr_0.8fr] md:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">
            University of Calgary · MSc 2025
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.12] text-fg md:text-6xl">
            Streamfunction from drifters
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted md:text-lg">
            Identical-twin Lagrangian data assimilation on the barotropic β-plane. A spectral
            ensemble Kalman filter (WHERE) recovers the Eulerian streamfunction ψ from noisy
            velocities at forty tracers — the same reconstruction target as Droobi (2025),
            Algorithms 5 and 8.{" "}
            <Link to="/simulate" className="text-accent underline-offset-4 hover:underline">
              Open the live lab
            </Link>{" "}
            to toggle every equation term and filter knob.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KeyStat
            label="WHERE XCOR"
            value={data ? formatNum(data.meta.xcor_where_mean, 3) : "—"}
            hint="thesis target > 0.9"
          />
          <KeyStat
            label="WHERE RMSE"
            value={data ? formatNum(data.meta.rmse_where_mean, 3) : "—"}
            hint="relative L2 on ψ"
          />
          <KeyStat
            label="Free-run XCOR"
            value={data ? formatNum(data.meta.xcor_free_mean, 3) : "—"}
            hint="same ICs, no DA"
          />
          <KeyStat
            label="Drifters"
            value={data ? String(data.meta.tracers) : "40"}
            hint={`${data?.meta.ne ?? 24} ensemble members`}
          />
        </div>
      </section>

      {data ? (
        <ReplayStudio data={data} />
      ) : (
        <div className="h-80 animate-pulse rounded-xl border border-line bg-surface" />
      )}

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Badge>Model</Badge>
            <CardTitle className="mt-3">Barotropic QG</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted">
            Periodic [0, 2π]² β-plane, Helmholtz inversion ψ̂ = −q̂/(κ²+μ), 2/3 dealiasing, RK4.
            Sign convention matches the working <span className="font-mono text-fg">baro.ipynb</span>{" "}
            notebook, not the unsigned formula typeset in Algorithm 5.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Badge>Filter</Badge>
            <CardTitle className="mt-3">WHERE + hybrid</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted">
            Stochastic EnKF on vorticity with Gaspari–Cohn localisation and multiplicative inflation.
            The hybrid branch adds systematic resampling (Alg. 8–9). Observations are noisy (u, v) at
            truth tracer sites.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Badge>Finding</Badge>
            <CardTitle className="mt-3">Large scales lock</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted">
            WHERE holds XCOR near 0.96 while the free run loses phase. Hybrid matches correlation but
            is slightly worse in RMSE — consistent with the thesis: resampling helps weights, smears
            QG small scales.
          </CardContent>
        </Card>
      </section>

      <p className="mt-10 text-sm text-subtle">
        Read the{" "}
        <Link to="/methods" className="text-accent underline-offset-4 hover:underline">
          numerical methods
        </Link>
        , the{" "}
        <Link to="/results" className="text-accent underline-offset-4 hover:underline">
          diagnostics
        </Link>
        , or the{" "}
        <Link to="/thesis" className="text-accent underline-offset-4 hover:underline">
          thesis narrative
        </Link>
        . Space toggles playback; arrows step frames.
      </p>
    </main>
  );
}

function KeyStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums text-fg">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
