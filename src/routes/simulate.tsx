import { createFileRoute, Link } from "@tanstack/react-router";
import { SimulatorDashboard } from "@/components/lab/simulator-dashboard";

export const Route = createFileRoute("/simulate")({
  component: SimulatePage,
});

function SimulatePage() {
  return (
    <main id="content" className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">Interactive lab</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-fg md:text-5xl">Generalized QG filter</h1>
      <p className="mt-4 max-w-3xl text-muted">
        Every term in the barotropic potential-vorticity equation and every knob in WHERE / hybrid
        EnKF–PF is live in the browser. Toggle advection, β, drag, hyperviscosity, forcing, or the
        Helmholtz μ; change ensemble size, drifter count, localisation, inflation, and observation
        noise. The truth is a Kolmogorov twin; reconstructions are the ensemble-mean streamfunction.
      </p>
      <p className="mt-2 text-sm text-subtle">
        Space plays and pauses. The committed{" "}
        <Link to="/" className="text-accent underline-offset-4 hover:underline">
          archive replay
        </Link>{" "}
        is the N = 32 Python run (XCOR 0.964). This lab is the same operator set, stepped in your
        browser.
      </p>
      <div className="mt-8">
        <SimulatorDashboard />
      </div>
    </main>
  );
}
