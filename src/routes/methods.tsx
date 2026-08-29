import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/methods")({ component: Methods });

function Methods() {
  return (
    <main id="content" className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">Chapter 8–10</p>
      <h1 className="mt-3 font-display text-4xl text-fg md:text-5xl">Methods</h1>
      <p className="mt-4 text-muted">
        Spectral barotropic quasi-geostrophy, Lagrangian tracers, and the WHERE ensemble Kalman
        filter as implemented for this reconstruction. The lab MATLAB trees
        Predictive-Intelligent-Systems-Lab/SWE_LaDA and QGcode_first_year return 404; the
        operators below are taken from Algorithms 5 and 8 of the thesis and from the private
        notebook baro.ipynb. The{" "}
        <Link to="/simulate" className="text-accent underline-offset-4 hover:underline">
          live lab
        </Link>{" "}
        runs the same spectral EnKF in the browser with every term and filter parameter exposed.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Barotropic QG on the β-plane</h2>
        <p className="mt-3 text-muted">
          Potential vorticity q and streamfunction ψ on the periodic square [0, 2π]² satisfy
        </p>
        <Eq>∂q/∂t + J(ψ, q) + β ∂ψ/∂x = F − d q − ν (−∇²)ᵖ q</Eq>
        <Eq>q = ∇²ψ − μ ψ,    u = (−∂ψ/∂y, ∂ψ/∂x)</Eq>
        <p className="mt-3 text-muted">
          Fourier inversion uses the Helmholtz kernel of the notebook, not the unsigned formula
          printed in Algorithm 5:
        </p>
        <Eq>ψ̂ = − q̂ / (κ² + μ),    û = − i k_y ψ̂,    v̂ = i k_x ψ̂</Eq>
        <p className="mt-3 text-muted">
          The Jacobian is evaluated in physical space from dealiased spectral derivatives (2/3
          rule) and advanced with classical RK4. Forcing is a deterministic Kolmogorov sinusoid
          at wavenumber k_f = 4. Linear drag and k⁴ hyperviscosity close the enstrophy cascade
          on the N = 32 truncation used for the live experiment (thesis Table 10.1 ran WHERE at
          N = 16 with a 128² truth).
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Lagrangian observations</h2>
        <p className="mt-3 text-muted">
          Tracers obey Ẋ = u(X) with periodic wrap and bilinear interpolation. The observation
          operator does not assimilate GPS positions. Following Algorithm 8 (“observed
          velocities from X”), the measurement at each analysis time is
        </p>
        <Eq>y = ( u(X_p) + ε_u,  v(X_p) + ε_v ),    ε ∼ N(0, σ_o² I)</Eq>
        <p className="mt-3 text-muted">
          with σ_o = 0.04 and L = 40 drifters on a jittered lattice. That operator is linear in
          vorticity (ψ is a linear Helmholtz map of q; interpolation is linear), which is why a
          localized EnKF is well-posed on this twin.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Algorithm 5 — WHERE</h2>
        <p className="mt-3 text-muted">
          WHERE (Wavevector-based High-dimensional Ensemble Recovery Estimator) is a spectral
          stochastic EnKF. Each member is a vorticity field. Forecast: RK4 on the QG residual.
          Analysis, every n_save steps:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Build predicted velocities Y = H(E) at the truth tracer sites.</li>
          <li>
            Sample covariances P_yy = YYᵀ/(N_e−1) + σ²I and P_xy = EYᵀ/(N_e−1), then Schur-product
            with Gaspari–Cohn localisation (compact support at 2 L_loc, L_loc = 1.55).
          </li>
          <li>K = P_xy P_yy⁻¹. Perturbed-observation update of every member.</li>
          <li>Inflate analysis anomalies by α = 1.08.</li>
        </ol>
        <p className="mt-3 text-muted">
          State dimension is N² = 1024, observation dimension 2L = 80, ensemble size 24. Without
          localisation the sample covariance is rank-deficient and spuriously couples opposite
          sides of the domain; Gaspari–Cohn is what makes N_e = 24 usable.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Algorithms 8–9 — hybrid EnKF–PF</h2>
        <p className="mt-3 text-muted">
          After the EnKF update, members are reweighted by the Gaussian velocity likelihood and
          systematically resampled when ESS/N_e drops below 0.55. A 1.5% jitter restores a
          usable sample covariance after cloning. The thesis reports that this hybrid is stronger
          on Lorenz-class SDEs and weaker on QG small scales; the live run reproduces that
          ordering.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Experiment parameters</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-elevated font-mono text-xs uppercase tracking-[0.12em] text-subtle">
              <tr>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">This run</th>
                <th className="px-3 py-2">Thesis Table 10.1</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              {ROWS.map((r) => (
                <tr key={r[0]} className="border-t border-line">
                  <td className="px-3 py-2 text-fg">{r[0]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r[1]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Demo horizon T = 28 rather than T = 2000 s. Diagnostics are relative L2 RMSE and Pearson
          correlation on ψ, plus isotropic kinetic energy spectra averaged over the last third of
          the window.
        </p>
      </section>

      <Card className="mt-10">
        <CardHeader>
          <Badge>Code</Badge>
          <CardTitle className="mt-2">Python reconstruction</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          The solver is numpy-only spectral code (rfft2, no scipy/matplotlib). Frames are packed as
          uint8 + base64 for the browser; GIFs are palette-mapped ffmpeg encodes of the same
          fields. Helmholtz sign, dealiasing, and velocity recovery were checked against
          baro.ipynb (psit = −rksq * zt, u = −∂ψ/∂y, v = ∂ψ/∂x).
        </CardContent>
      </Card>
    </main>
  );
}

function Eq({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md bg-elevated px-4 py-3 font-display text-[15px] leading-relaxed text-fg md:text-lg">
      {children}
    </pre>
  );
}

const ROWS: Array<[string, string, string]> = [
  ["Grid N", "32", "16 (DA) / 128 (truth)"],
  ["Ensemble N_e", "24", "—"],
  ["Tracers L", "40", "20 (WHERE) / 40 (CGNF)"],
  ["Δt", "0.02", "0.02"],
  ["Analysis interval", "0.35", "0.2 (10 Δt)"],
  ["β, μ, d", "0.05, 0.05, 0.08", "β = 0.05, d = 0.1"],
  ["σ_o", "0.04", "0.01–0.1"],
  ["E0 / spectrum", "0.8 / Kolmogorov", "0.8 / kolmo"],
  ["Forcing", "sin, k_f = 4", "sin"],
];
