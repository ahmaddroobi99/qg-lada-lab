import { createFileRoute } from "@tanstack/react-router";
import { MetricsChart } from "@/components/metrics-chart";
import { SpectrumChart } from "@/components/spectrum-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunData } from "@/lib/run-data";
import { formatNum } from "@/lib/utils";
import runPayload from "@/data/run.json";

export const Route = createFileRoute("/results")({
  loader: () => runPayload as RunData,
  component: Results,
});

function Results() {
  const data = Route.useLoaderData();

  return (
    <main id="content" className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">Chapter 10</p>
      <h1 className="mt-3 font-display text-4xl text-fg md:text-5xl">Results</h1>
      <p className="mt-4 max-w-3xl text-muted">
        WHERE recovers the streamfunction at mean XCOR 0.96. The free-running ensemble, started
        from the same perturbed members, loses phase within a few eddy turnovers. That gap is the
        whole point of Lagrangian DA on this twin: forty noisy velocity samples are enough to
        hold the large-scale ψ against chaos.
      </p>

      {data && (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            <Score
              title="WHERE"
              xcor={data.meta.xcor_where_mean}
              rmse={data.meta.rmse_where_mean}
              note="localized stochastic EnKF"
            />
            <Score
              title="Hybrid EnKF–PF"
              xcor={data.meta.xcor_hybrid_mean}
              rmse={data.meta.rmse_hybrid_mean}
              note="EnKF then systematic resampling"
            />
            <Score
              title="Free run"
              xcor={data.meta.xcor_free_mean}
              rmse={data.meta.rmse_free_mean}
              note="no observations"
            />
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Anomaly correlation</CardTitle>
                <CardDescription>Pearson correlation of reconstructed vs truth ψ</CardDescription>
              </CardHeader>
              <CardContent>
                <MetricsChart
                  data={data}
                  yLabel="XCOR"
                  yDomain={[0, 1]}
                  keys={[
                    { key: "xcor_where", name: "WHERE", color: "#8ea4bc" },
                    { key: "xcor_hybrid", name: "Hybrid", color: "#b7c4d4" },
                    { key: "xcor_free", name: "Free", color: "#5c6774" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Relative RMSE</CardTitle>
                <CardDescription>‖ψ_a − ψ_t‖₂ / ‖ψ_t‖₂</CardDescription>
              </CardHeader>
              <CardContent>
                <MetricsChart
                  data={data}
                  yLabel="RMSE"
                  keys={[
                    { key: "rmse_where", name: "WHERE", color: "#8ea4bc" },
                    { key: "rmse_hybrid", name: "Hybrid", color: "#b7c4d4" },
                    { key: "rmse_free", name: "Free", color: "#5c6774" },
                  ]}
                />
              </CardContent>
            </Card>
          </section>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Kinetic energy spectrum</CardTitle>
              <CardDescription>
                Isotropic E(k) averaged over the last third of the window. WHERE tracks the forced
                band; the free run does not.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpectrumChart data={data} />
            </CardContent>
          </Card>
        </>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">Animated fields</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Same colour scale on every panel. Dots are the forty truth tracers. Hybrid is smoother
          than WHERE — resampling clones members and damps small-scale variance, the behaviour
          reported in §10.6.
        </p>
        <div className="mt-6 grid gap-6">
          <Gif
            src="/media/psi_compare.gif"
            caption="Truth, WHERE, and hybrid streamfunction. Tracers overlaid on the first two panels."
          />
          <Gif
            src="/media/psi_free.gif"
            caption="Truth, WHERE, and the no-DA free run. Phase error in the free column is the forecast skill ceiling without floats."
          />
          <Gif
            src="/media/psi_error.gif"
            caption="Pointwise WHERE − truth residual. Errors concentrate at filament edges, not in the gyre cores."
          />
          <Gif
            src="/media/vorticity.gif"
            caption="Truth vorticity alongside streamfunction. q is the analysed state; ψ is the inverted, observationally relevant field."
          />
        </div>
      </section>

      <section className="mt-10 max-w-3xl space-y-4 text-sm text-muted">
        <h2 className="font-display text-2xl text-fg">Reading against the thesis</h2>
        <p>
          Chapter 10 quotes WHERE RMSE {"<"} 0.15 and XCOR {">"} 0.9 on a long N = 16 window. This
          demo is coarser in time (T = 28, not 2000) and finer in space (N = 32), with a colder
          ensemble (55% independent Kolmogorov mix). Mean WHERE XCOR ={" "}
          {data ? formatNum(data.meta.xcor_where_mean, 3) : "0.96"} clears the correlation target.
          Relative RMSE sits higher than the thesis headline because the H¹-normalised E_ψ of
          Table 10.4 is not the same as the L² ratio plotted here, and because the twin is not
          weakly perturbed.
        </p>
        <p>
          Hybrid EnKF–PF is not uniformly better. Correlation is comparable; RMSE is worse. That
          matches the thesis conclusion on QG: particle resampling fights non-Gaussian weights but
          cannot represent the small-scale vorticity cascade with two dozen clones. Lorenz 63/96
          in Chapters 5–7 is the regime where the hybrid earns its keep.
        </p>
        <p>
          The free run is the control that many DA papers omit. XCOR collapsing toward 0.3 says
          the filter is not “following a slow climatology” — it is tracking a chaotic trajectory
          that unconstrained members lose.
        </p>
      </section>
    </main>
  );
}

function Score({
  title,
  xcor,
  rmse,
  note,
}: {
  title: string;
  xcor: number;
  rmse: number;
  note: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Badge>{note}</Badge>
        <CardTitle className="mt-3">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-6 font-mono text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-subtle">XCOR</p>
          <p className="text-2xl tabular-nums text-fg">{formatNum(xcor, 3)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-subtle">RMSE</p>
          <p className="text-2xl tabular-nums text-fg">{formatNum(rmse, 3)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Gif({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <img src={src} alt={caption} className="w-full" loading="lazy" />
      <figcaption className="px-4 py-3 text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}
