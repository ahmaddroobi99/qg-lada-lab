import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/thesis")({ component: Thesis });

function Thesis() {
  return (
    <main id="content" className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">
        Mechanical Engineering · University of Calgary · July 2025
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-fg md:text-5xl">
        Data-Driven Filtering Techniques for Turbulent Flow Models
      </h1>
      <p className="mt-2 font-display text-xl italic text-muted">
        A Lagrangian Data Assimilation Approach
      </p>
      <p className="mt-4 text-sm text-subtle">Ahmad Hamdan Droobi · supervisor Mustafa Mohamad</p>

      <section className="mt-10">
        <Badge>Abstract</Badge>
        <div className="mt-4 space-y-4 text-muted">
          <p>
            This work treats high-dimensional fluid flows, focusing on quasi-geostrophic systems,
            and the recovery of Eulerian energy spectra from a partial, noisy, time-sequential set
            of tracer measurements. Lagrangian floats are the natural sensors of the ocean: they
            stream local velocity, not a gridded streamfunction. The inverse problem is to turn
            those tracks into ψ.
          </p>
          <p>
            A hybrid filter merging Ensemble Kalman and particle-filter steps is built for that
            operator. The hierarchy of testbeds runs from stochastic Lorenz 63 and Lorenz 96
            through shallow-water (plane and sphere) to single-layer barotropic QG. The QG
            experiment is the one on this site: spectral truth, Lagrangian velocities, WHERE
            EnKF, hybrid resampling, free-run control.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Contributions</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-muted">
          <li>
            Lagrangian EnKF on planar and spherical shallow water, recovering velocity from
            advected tracers with RMSE and anomaly-correlation time series.
          </li>
          <li>
            Reduction of the rotating-sphere envelope to a single-layer QG streamfunction, so the
            same observation operator applies to barotropic ocean gyres.
          </li>
          <li>
            WHERE: a spectral stochastic EnKF with Helmholtz inversion, localisation, and
            inflation, targeting ψ reconstruction from O(10)–O(40) floats.
          </li>
          <li>
            Hybrid EnKF–PF with systematic resampling. Useful on low-dimensional chaotic ODEs;
            on QG it preserves large-scale correlation but does not beat WHERE on small-scale RMSE.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">What this reconstruction is — and is not</h2>
        <div className="mt-4 space-y-4 text-muted">
          <p>
            It is a faithful identical-twin of Chapter 10 at demo resolution: same PDE, same
            observation type, same filter algebra, Helmholtz sign taken from the actual notebook
            rather than the typeset algorithm. Metrics are in the same family as the thesis
            (RMSE, XCOR, E(k)).
          </p>
          <p>
            It is not a bit-exact replay of the MATLAB lab codes. Those repositories are empty or
            404. It is not a 128², T = 2000 production window, and it does not implement CGNF.
            Claims that need that grid (submesoscale spectral tails, Table 10.4 H¹ errors) should
            be read from the PDF, not from this N = 32 twin.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Cite</h2>
        <pre className="mt-4 overflow-x-auto rounded-md bg-elevated px-4 py-3 font-mono text-xs leading-relaxed text-fg">
{`Droobi, A. H. (2025). Data-Driven Filtering Techniques for
Turbulent Flow Models (A Lagrangian Data Assimilation Approach).
MSc thesis, University of Calgary.
https://ucalgary.scholaris.ca/items/b4a3d3b9-4fbf-4d1e-8e1e-80c71c009825`}
        </pre>
        <p className="mt-4 text-sm text-muted">
          Full text:{" "}
          <a
            className="text-accent underline-offset-4 hover:underline"
            href="https://ucalgary.scholaris.ca/items/b4a3d3b9-4fbf-4d1e-8e1e-80c71c009825"
            target="_blank"
            rel="noreferrer"
          >
            ucalgary.scholaris.ca
          </a>
          . Source for this twin:{" "}
          <a
            className="text-accent underline-offset-4 hover:underline"
            href="https://github.com/ahmaddroobi99/QG_work"
            target="_blank"
            rel="noreferrer"
          >
            github.com/ahmaddroobi99/QG_work
          </a>
          .
        </p>
      </section>
    </main>
  );
}
