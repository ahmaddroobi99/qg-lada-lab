#!/usr/bin/env python3
"""
Barotropic quasi-geostrophic Lagrangian data assimilation.

Reconstructs the Eulerian streamfunction from sparse, noisy drifter
velocities on the periodic beta-plane. Physics and the analysis step
follow Droobi, MSc thesis, University of Calgary, 2025:

  Algorithms 5 (WHERE / spectral stochastic EnKF) and 8–9 (hybrid EnKF–PF)
  Tables 10.1 / 10.4

Spectral operators match the working notebook ``baro.ipynb`` in
``UQ_QG_LOU_models_MS_code_process`` (Helmholtz sign: psihat = -qhat/(k^2+mu)),
not the unsigned formula printed in Algorithm 5.

Identical-twin experiment
-------------------------
Truth is a spun-up Kolmogorov barotropic flow. An ensemble is initialised
from the same snapshot plus independent spectral perturbations. WHERE
assimilates noisy velocities sampled at the *truth* tracer locations.
A parallel hybrid ensemble applies systematic resampling after each EnKF
update. A free-run ensemble is the no-DA baseline.

Outputs
-------
public/data/run.json          compact frames + metrics for the website
public/media/*.gif            animated reconstructions
research/metrics_summary.json scalar diagnostics
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
# Sandbox layout: this file lives in /workspace/research/; site assets in /workspace.
# Standalone clone of QG_work: this file is at the repo root.
if (ROOT.parent / "public").is_dir():
    ROOT = ROOT.parent
OUT_DATA = ROOT / "public" / "data"
OUT_MEDIA = ROOT / "public" / "media"
OUT_RESEARCH = Path(__file__).resolve().parent
FRAME_DIR = ROOT / "artifacts" / "qg_frames"

TWO_PI = 2.0 * np.pi


# ---------------------------------------------------------------------------
# Spectral QG operators
# ---------------------------------------------------------------------------


class BarotropicQG:
    """Dealiased spectral barotropic QG on [0, 2pi]^2.

    Potential vorticity / streamfunction relation (Helmholtz):
        q = nabla^2 psi - mu psi
        psihat = - qhat / (k^2 + mu)

    Momentum:
        u = - d psi / dy,  v = d psi / dx

    Evolution:
        dq/dt + J(psi, q) + beta * d psi / dx = F - d * q - nu * (-nabla^2)^p q
    """

    def __init__(
        self,
        n: int = 32,
        mu: float = 0.05,
        beta: float = 0.05,
        drag: float = 0.1,
        nu: float = 4.0e-4,
        p_visc: int = 2,
        kf: int = 4,
        f0: float = 0.18,
        dealias: float = 2.0 / 3.0,
    ) -> None:
        self.n = int(n)
        self.mu = float(mu)
        self.beta = float(beta)
        self.drag = float(drag)
        self.nu = float(nu)
        self.p_visc = int(p_visc)
        self.kf = int(kf)
        self.f0 = float(f0)

        n_ = self.n
        self.dx = TWO_PI / n_
        x = np.arange(n_) * self.dx
        self.x = x
        self.xx, self.yy = np.meshgrid(x, x)

        kx = np.fft.fftfreq(n_, d=1.0 / n_).astype(np.float64)
        ky = kx.copy()
        kxr = kx[: n_ // 2 + 1]
        self.kx, self.ky = np.meshgrid(kxr, ky)
        self.ksq = self.kx**2 + self.ky**2
        self.kabs = np.sqrt(self.ksq)

        inv = np.zeros_like(self.ksq)
        denom = self.ksq + self.mu
        np.divide(-1.0, denom, out=inv, where=denom > 1e-14)
        inv[0, 0] = 0.0
        self.invhel = inv

        kcut = dealias * (n_ / 2.0)
        self.mask = (self.kabs <= kcut).astype(np.float64)
        self.mask[0, 0] = 0.0

        # Linear dissipation in spectral space: drag + hyperviscosity.
        self.diss = self.drag + self.nu * (self.ksq**self.p_visc)

        # Deterministic Kolmogorov-type vorticity forcing (thesis: forcingtype sin).
        self.forcing = self.f0 * (
            np.sin(self.kf * self.xx) * np.cos(self.kf * self.yy)
            + 0.35 * np.sin((self.kf + 1) * self.xx) * np.sin((self.kf - 1) * self.yy)
        )
        self.forcing_hat = np.fft.rfft2(self.forcing) * self.mask

    # -- spectral helpers ---------------------------------------------------

    def rfft(self, f: np.ndarray) -> np.ndarray:
        return np.fft.rfft2(f, axes=(-2, -1)) * self.mask

    def irfft(self, fh: np.ndarray) -> np.ndarray:
        return np.fft.irfft2(fh, s=(self.n, self.n), axes=(-2, -1))

    def invert(self, q: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return psi, u, v, qhat from vorticity (batched on leading axes)."""
        qh = self.rfft(q)
        psih = qh * self.invhel
        uh = -1j * self.ky * psih
        vh = 1j * self.kx * psih
        psi = self.irfft(psih)
        u = self.irfft(uh)
        v = self.irfft(vh)
        return psi, u, v, qh

    def rhs(self, q: np.ndarray) -> np.ndarray:
        """dq/dt for a (..., N, N) vorticity field."""
        psi, u, v, qh = self.invert(q)
        qxh = 1j * self.kx * qh
        qyh = 1j * self.ky * qh
        qx = self.irfft(qxh)
        qy = self.irfft(qyh)
        jac = u * qx + v * qy
        jach = self.rfft(jac)
        qh_dot = -jach - self.diss * qh + self.forcing_hat
        # beta * d psi / dx  =  beta * v
        r = self.irfft(qh_dot) - self.beta * v
        return r

    def rk4(self, q: np.ndarray, dt: float) -> np.ndarray:
        k1 = self.rhs(q)
        k2 = self.rhs(q + 0.5 * dt * k1)
        k3 = self.rhs(q + 0.5 * dt * k2)
        k4 = self.rhs(q + dt * k3)
        return q + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)

    def energy(self, q: np.ndarray) -> np.ndarray:
        """Mean kinetic energy 0.5 <u^2+v^2> . Accepts (N,N) or (Ne,N,N)."""
        _, u, v, _ = self.invert(q)
        ke = 0.5 * (u * u + v * v)
        return ke.mean(axis=(-2, -1))

    def spectrum(self, q: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Isotropic kinetic energy spectrum of a single (N,N) field."""
        _, u, v, _ = self.invert(q)
        uh = np.fft.rfft2(u)
        vh = np.fft.rfft2(v)
        # Account for rfft Hermitian redundancy: double ky!=0 and ky!=Nyquist.
        n = self.n
        power = 0.5 * (np.abs(uh) ** 2 + np.abs(vh) ** 2) / (n * n) ** 2
        fac = np.ones_like(power)
        fac[:, 1:-1] = 2.0
        if n % 2 == 0:
            fac[:, -1] = 1.0
        power *= fac
        k_int = np.rint(self.kabs).astype(int)
        kmax = int(k_int.max())
        ek = np.zeros(kmax + 1)
        for k in range(1, kmax + 1):
            ek[k] = power[k_int == k].sum()
        ks = np.arange(kmax + 1)
        return ks, ek

    def kolmogorov_field(self, rng: np.random.Generator, e0: float, k0: float = 4.0) -> np.ndarray:
        """Random-phase vorticity with a peaked Kolmogorov-like energy spectrum."""
        n = self.n
        # Full complex spectrum then rfft-pack.
        phase = rng.uniform(0.0, TWO_PI, size=(n, n))
        # Hermitian-symmetrise later via rfft of a real field.
        amp = np.exp(-((self.kabs - k0) ** 2) / (2.0 * 1.6**2))
        amp = amp / (self.kabs + 0.3) ** 1.15
        amp *= self.mask
        amp[0, 0] = 0.0
        qh = amp * np.exp(1j * rng.uniform(0.0, TWO_PI, size=self.ksq.shape))
        qh[0, 0] = 0.0
        q = self.irfft(qh)
        e = float(self.energy(q))
        if e > 1e-16:
            q *= math.sqrt(e0 / e)
        return q.astype(np.float64)


# ---------------------------------------------------------------------------
# Interpolation, tracers, localisation
# ---------------------------------------------------------------------------


def bilinear(field: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Periodic bilinear sample. field (..., N, N), xs/ys (L,) in [0, 2pi)."""
    n = field.shape[-1]
    gx = (xs % TWO_PI) / TWO_PI * n
    gy = (ys % TWO_PI) / TWO_PI * n
    i0 = np.floor(gx).astype(int) % n
    j0 = np.floor(gy).astype(int) % n
    i1 = (i0 + 1) % n
    j1 = (j0 + 1) % n
    fx = gx - np.floor(gx)
    fy = gy - np.floor(gy)
    f00 = field[..., j0, i0]
    f10 = field[..., j0, i1]
    f01 = field[..., j1, i0]
    f11 = field[..., j1, i1]
    return (
        f00 * (1.0 - fx) * (1.0 - fy)
        + f10 * fx * (1.0 - fy)
        + f01 * (1.0 - fx) * fy
        + f11 * fx * fy
    )


def advect_tracers(xs: np.ndarray, ys: np.ndarray, u: np.ndarray, v: np.ndarray, dt: float) -> tuple[np.ndarray, np.ndarray]:
    """RK2 periodic advection of L tracers by a (N,N) velocity field."""
    u1 = bilinear(u, xs, ys)
    v1 = bilinear(v, xs, ys)
    x2 = (xs + 0.5 * dt * u1) % TWO_PI
    y2 = (ys + 0.5 * dt * v1) % TWO_PI
    u2 = bilinear(u, x2, y2)
    v2 = bilinear(v, x2, y2)
    return (xs + dt * u2) % TWO_PI, (ys + dt * v2) % TWO_PI


def gaspari_cohn(r: np.ndarray) -> np.ndarray:
    """Gaspari–Cohn compact fifth-order correlation (compact support at r=2)."""
    z = np.abs(r)
    out = np.zeros_like(z)
    m1 = z <= 1.0
    m2 = (z > 1.0) & (z <= 2.0)
    z1 = z[m1]
    z2 = z[m2]
    out[m1] = (((-0.25 * z1 + 0.5) * z1 + 0.625) * z1 - 5.0 / 3.0) * z1 * z1 + 1.0
    out[m2] = (
        ((((1.0 / 12.0) * z2 - 0.5) * z2 + 0.625) * z2 + 5.0 / 3.0) * z2 - 5.0
    ) * z2 + 4.0 - 2.0 / (3.0 * z2)
    return out


def periodic_dist(x1: np.ndarray, y1: np.ndarray, x2: np.ndarray, y2: np.ndarray) -> np.ndarray:
    dx = np.abs(x1 - x2)
    dy = np.abs(y1 - y2)
    dx = np.minimum(dx, TWO_PI - dx)
    dy = np.minimum(dy, TWO_PI - dy)
    return np.sqrt(dx * dx + dy * dy)


def localisation_matrices(
    n: int, xs: np.ndarray, ys: np.ndarray, loc_radius: float
) -> tuple[np.ndarray, np.ndarray]:
    """Return (rho_xy, rho_yy) for vorticity-grid vs velocity-at-tracer obs.

    rho_xy: (N*N, 2L)  — grid point to each (u,v) observation
    rho_yy: (2L, 2L)   — observation-observation
    """
    x = np.arange(n) * (TWO_PI / n)
    xx, yy = np.meshgrid(x, x)
    gx = xx.ravel()[:, None]
    gy = yy.ravel()[:, None]
    # Observations: L of u then L of v, both at the same tracer sites.
    tx = np.concatenate([xs, xs])[None, :]
    ty = np.concatenate([ys, ys])[None, :]
    dist_xy = periodic_dist(gx, gy, tx, ty)
    rho_xy = gaspari_cohn(dist_xy / loc_radius)

    xa = np.concatenate([xs, xs])[:, None]
    ya = np.concatenate([ys, ys])[:, None]
    xb = np.concatenate([xs, xs])[None, :]
    yb = np.concatenate([ys, ys])[None, :]
    dist_yy = periodic_dist(xa, ya, xb, yb)
    rho_yy = gaspari_cohn(dist_yy / loc_radius)
    return rho_xy, rho_yy


def observe_velocity(model: BarotropicQG, q: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """(2L,) or (Ne, 2L) velocities at tracer sites."""
    _, u, v, _ = model.invert(q)
    uo = bilinear(u, xs, ys)
    vo = bilinear(v, xs, ys)
    if q.ndim == 2:
        return np.concatenate([uo, vo], axis=0)
    return np.concatenate([uo, vo], axis=-1)


def stochastic_enkf(
    ens: np.ndarray,
    y_ens: np.ndarray,
    d: np.ndarray,
    sigma_o: float,
    rho_xy: np.ndarray,
    rho_yy: np.ndarray,
    inflation: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Perturbed-observation EnKF with Schur-product localisation (Alg. 5).

    ens:  (Ne, N, N) vorticity
    y_ens:(Ne, 2L) predicted velocities
    d:    (2L,) observations
    """
    ne, n, _ = ens.shape
    nobs = d.shape[0]
    x = ens.reshape(ne, n * n)
    x_mean = x.mean(axis=0)
    y_mean = y_ens.mean(axis=0)
    xa = (x - x_mean).T  # (Ns, Ne)
    ya = (y_ens - y_mean).T  # (Nobs, Ne)
    den = max(ne - 1, 1)
    pyy = (ya @ ya.T) / den
    pxy = (xa @ ya.T) / den
    r = (sigma_o**2) * np.eye(nobs)
    pyy = pyy * rho_yy + r
    pxy = pxy * rho_xy
    # Jitter the diagonal for numerical safety.
    pyy = pyy + 1e-8 * np.eye(nobs)
    k_gain = np.linalg.solve(pyy.T, pxy.T).T  # (Ns, Nobs)
    pert = rng.normal(0.0, sigma_o, size=(ne, nobs))
    innov = (d[None, :] + pert) - y_ens
    x_a = x + innov @ k_gain.T
    # Multiplicative inflation of analysis anomalies.
    mean = x_a.mean(axis=0)
    anom = x_a - mean
    x_a = mean + inflation * anom
    return x_a.reshape(ne, n, n)


def systematic_resample(weights: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    ne = weights.size
    w = weights / weights.sum()
    u0 = rng.random() / ne
    positions = u0 + np.arange(ne) / ne
    cum = np.cumsum(w)
    idx = np.searchsorted(cum, positions, side="right")
    return np.clip(idx, 0, ne - 1)


def hybrid_resample(
    ens: np.ndarray,
    y_ens: np.ndarray,
    d: np.ndarray,
    sigma_o: float,
    rng: np.random.Generator,
    ess_threshold: float = 0.55,
) -> np.ndarray:
    """Importance weights + systematic resampling (Alg. 8–9)."""
    ne = ens.shape[0]
    resid = y_ens - d[None, :]
    logw = -0.5 * np.sum((resid / sigma_o) ** 2, axis=1)
    logw -= logw.max()
    w = np.exp(logw)
    w_sum = w.sum()
    if not np.isfinite(w_sum) or w_sum <= 0:
        return ens
    w = w / w_sum
    ess = 1.0 / np.sum(w * w)
    if ess >= ess_threshold * ne:
        return ens
    idx = systematic_resample(w, rng)
    out = ens[idx].copy()
    # Tiny jitter so exact clones do not collapse the sample covariance.
    spread = out.std() + 1e-8
    out += 0.015 * spread * rng.standard_normal(out.shape)
    return out


# ---------------------------------------------------------------------------
# Colour map / GIF helpers
# ---------------------------------------------------------------------------


def lerp(a: np.ndarray, b: np.ndarray, t: np.ndarray) -> np.ndarray:
    return a + (b - a) * t[..., None]


def rdbu_color(v: np.ndarray) -> np.ndarray:
    """Diverging RdBu, v in [0, 1] -> uint8 RGB. Scientific field map, not chrome."""
    stops = np.array(
        [
            [5, 48, 97],
            [33, 102, 172],
            [103, 169, 207],
            [209, 229, 240],
            [247, 247, 247],
            [253, 219, 199],
            [244, 165, 130],
            [178, 24, 43],
            [103, 0, 31],
        ],
        dtype=np.float64,
    )
    pos = np.linspace(0.0, 1.0, len(stops))
    v = np.clip(v, 0.0, 1.0)
    idx = np.searchsorted(pos, v, side="right") - 1
    idx = np.clip(idx, 0, len(stops) - 2)
    t = (v - pos[idx]) / (pos[idx + 1] - pos[idx] + 1e-12)
    rgb = lerp(stops[idx], stops[idx + 1], t)
    return np.clip(rgb, 0, 255).astype(np.uint8)


def field_to_rgb(field: np.ndarray, vmin: float, vmax: float, size: int) -> np.ndarray:
    t = (field - vmin) / (vmax - vmin + 1e-12)
    rgb = rdbu_color(t)
    img = Image.fromarray(rgb, mode="RGB").resize((size, size), Image.BICUBIC)
    return np.asarray(img)


def overlay_tracers(rgb: np.ndarray, xs: np.ndarray, ys: np.ndarray, n_grid: int) -> np.ndarray:
    h, w, _ = rgb.shape
    out = rgb.copy()
    px = (xs / TWO_PI * w).astype(int) % w
    py = (ys / TWO_PI * h).astype(int) % h
    r = max(2, h // 90)
    yy, xx = np.ogrid[:h, :w]
    for x, y in zip(px, py):
        mask = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
        out[mask] = (18, 18, 22)
        ring = ((xx - x) ** 2 + (yy - y) ** 2 <= (r + 1) ** 2) & ~mask
        out[ring] = (236, 232, 220)
    return out


def panel_label(rgb: np.ndarray, text: str) -> Image.Image:
    img = Image.fromarray(rgb, mode="RGB")
    # Draw a thin top bar so labels remain readable without a font dependency
    # (PIL default bitmap font is always available).
    from PIL import ImageDraw

    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, img.width, 18], fill=(8, 10, 14))
    draw.text((8, 3), text, fill=(220, 224, 228))
    return img


def hstack_images(imgs: list[Image.Image], gap: int = 4, bg=(7, 9, 13)) -> Image.Image:
    w = sum(im.width for im in imgs) + gap * (len(imgs) - 1)
    h = max(im.height for im in imgs)
    canvas = Image.new("RGB", (w, h), bg)
    x = 0
    for im in imgs:
        canvas.paste(im, (x, 0))
        x += im.width + gap
    return canvas


def write_gif_from_pngs(pattern: Path, outfile: Path, fps: int = 12) -> None:
    """ffmpeg palette GIF (much cleaner than naive PIL quantisation)."""
    outfile.parent.mkdir(parents=True, exist_ok=True)
    palette = outfile.with_suffix(".palette.png")
    src = str(pattern)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                src,
                "-vf",
                "palettegen=stats_mode=full",
                str(palette),
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(fps),
                "-i",
                src,
                "-i",
                str(palette),
                "-lavfi",
                "paletteuse=dither=sierra2_4a",
                "-loop",
                "0",
                str(outfile),
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        print("ffmpeg gif failed, falling back to PIL:", exc.stderr[-400:] if exc.stderr else exc)
        frames = sorted(pattern.parent.glob(pattern.name.replace("%04d", "*")))
        if not frames:
            return
        pil = [Image.open(p).convert("P", palette=Image.ADAPTIVE, colors=128) for p in frames]
        pil[0].save(
            outfile,
            save_all=True,
            append_images=pil[1:],
            duration=int(1000 / fps),
            loop=0,
            optimize=True,
        )
    finally:
        if palette.exists():
            palette.unlink()


def quantize_stack(stack: np.ndarray, vmin: float, vmax: float) -> bytes:
    t = np.clip((stack - vmin) / (vmax - vmin + 1e-12), 0.0, 1.0)
    u8 = np.rint(t * 255.0).astype(np.uint8)
    return u8.tobytes()


# ---------------------------------------------------------------------------
# Experiment
# ---------------------------------------------------------------------------


def run_experiment(args: argparse.Namespace) -> dict:
    rng = np.random.default_rng(args.seed)
    model = BarotropicQG(
        n=args.n,
        mu=args.mu,
        beta=args.beta,
        drag=args.drag,
        nu=args.nu,
        kf=args.kf,
        f0=args.f0,
    )
    n = model.n
    ne = args.ne
    ntr = args.tracers
    dt = args.dt
    n_spin = int(round(args.tspin / dt))
    n_steps = int(round(args.tend / dt))
    n_save = max(1, int(round(args.dtsave / dt)))
    n_frames = n_steps // n_save

    print(
        f"QG LaDA  N={n}  Ne={ne}  L={ntr}  dt={dt}  T={args.tend}  "
        f"spin={args.tspin}  frames={n_frames}",
        flush=True,
    )

    # --- truth spin-up -----------------------------------------------------
    q_t = model.kolmogorov_field(rng, args.e0, k0=float(args.kf))
    for i in range(n_spin):
        q_t = model.rk4(q_t, dt)
        if (i + 1) % 100 == 0:
            print(f"  spin-up {i+1}/{n_spin}  E={float(model.energy(q_t)):.3f}", flush=True)

    # Independent spectral perturbations around the spun-up truth.
    def perturb(q0: np.ndarray, amp: float) -> np.ndarray:
        noise = model.kolmogorov_field(rng, args.e0, k0=float(args.kf) + rng.uniform(-1.0, 1.0))
        return (1.0 - amp) * q0 + amp * noise

    q_where = np.stack([perturb(q_t, args.ens_amp) for _ in range(ne)])
    q_hybrid = q_where.copy()
    q_free = q_where.copy()

    # Tracers: jittered lattice so coverage is even but not grid-locked.
    nside = int(math.ceil(math.sqrt(ntr)))
    gx = np.linspace(0.15, TWO_PI - 0.15, nside)
    gy = np.linspace(0.15, TWO_PI - 0.15, nside)
    xx, yy = np.meshgrid(gx, gy)
    xs = xx.ravel()[:ntr] + rng.uniform(-0.08, 0.08, ntr)
    ys = yy.ravel()[:ntr] + rng.uniform(-0.08, 0.08, ntr)
    xs %= TWO_PI
    ys %= TWO_PI

    # Storage
    psi_truth = np.zeros((n_frames, n, n), dtype=np.float32)
    psi_where = np.zeros_like(psi_truth)
    psi_hybrid = np.zeros_like(psi_truth)
    psi_free = np.zeros_like(psi_truth)
    q_truth_s = np.zeros_like(psi_truth)
    tracers = np.zeros((n_frames, ntr, 2), dtype=np.float32)
    times = np.zeros(n_frames)
    metrics = {k: np.zeros(n_frames) for k in (
        "rmse_where", "xcor_where", "rmse_hybrid", "xcor_hybrid",
        "rmse_free", "xcor_free", "spread_where", "spread_hybrid",
        "energy_truth", "energy_where", "energy_hybrid", "energy_free",
        "ess_hybrid",
    )}

    def rel_rmse(a: np.ndarray, b: np.ndarray) -> float:
        num = float(np.sqrt(np.mean((a - b) ** 2)))
        den = float(np.sqrt(np.mean(b ** 2))) + 1e-12
        return num / den

    def xcor(a: np.ndarray, b: np.ndarray) -> float:
        a0 = a.ravel() - a.mean()
        b0 = b.ravel() - b.mean()
        den = float(np.linalg.norm(a0) * np.linalg.norm(b0)) + 1e-12
        return float(np.dot(a0, b0) / den)

    t0 = time.time()
    iframe = 0
    for step in range(1, n_steps + 1):
        q_t = model.rk4(q_t, dt)
        q_where = model.rk4(q_where, dt)
        q_hybrid = model.rk4(q_hybrid, dt)
        q_free = model.rk4(q_free, dt)

        psi_t, u_t, v_t, _ = model.invert(q_t)
        xs, ys = advect_tracers(xs, ys, u_t, v_t, dt)

        if step % n_save == 0:
            # Observations: noisy velocities at truth tracer locations (Alg. 8).
            y_true = np.concatenate(
                [bilinear(u_t, xs, ys), bilinear(v_t, xs, ys)], axis=0
            )
            d = y_true + rng.normal(0.0, args.sigma_o, size=y_true.shape)
            rho_xy, rho_yy = localisation_matrices(n, xs, ys, args.loc_radius)

            y_w = observe_velocity(model, q_where, xs, ys)
            q_where = stochastic_enkf(
                q_where, y_w, d, args.sigma_o, rho_xy, rho_yy, args.inflation, rng
            )

            y_h = observe_velocity(model, q_hybrid, xs, ys)
            q_hybrid = stochastic_enkf(
                q_hybrid, y_h, d, args.sigma_o, rho_xy, rho_yy, args.inflation, rng
            )
            y_h2 = observe_velocity(model, q_hybrid, xs, ys)
            q_hybrid = hybrid_resample(q_hybrid, y_h2, d, args.sigma_o, rng)
            resid = y_h2 - d
            logw = -0.5 * np.sum((resid / args.sigma_o) ** 2, axis=1)
            logw -= logw.max()
            w = np.exp(logw)
            w = w / (w.sum() + 1e-16)
            ess = float(1.0 / np.sum(w * w))

            psi_w, _, _, _ = model.invert(q_where.mean(axis=0))
            psi_h, _, _, _ = model.invert(q_hybrid.mean(axis=0))
            psi_f, _, _, _ = model.invert(q_free.mean(axis=0))

            psi_truth[iframe] = psi_t
            psi_where[iframe] = psi_w
            psi_hybrid[iframe] = psi_h
            psi_free[iframe] = psi_f
            q_truth_s[iframe] = q_t
            tracers[iframe, :, 0] = xs
            tracers[iframe, :, 1] = ys
            times[iframe] = step * dt

            metrics["rmse_where"][iframe] = rel_rmse(psi_w, psi_t)
            metrics["xcor_where"][iframe] = xcor(psi_w, psi_t)
            metrics["rmse_hybrid"][iframe] = rel_rmse(psi_h, psi_t)
            metrics["xcor_hybrid"][iframe] = xcor(psi_h, psi_t)
            metrics["rmse_free"][iframe] = rel_rmse(psi_f, psi_t)
            metrics["xcor_free"][iframe] = xcor(psi_f, psi_t)
            metrics["spread_where"][iframe] = float(q_where.std())
            metrics["spread_hybrid"][iframe] = float(q_hybrid.std())
            metrics["energy_truth"][iframe] = float(model.energy(q_t))
            metrics["energy_where"][iframe] = float(model.energy(q_where.mean(axis=0)))
            metrics["energy_hybrid"][iframe] = float(model.energy(q_hybrid.mean(axis=0)))
            metrics["energy_free"][iframe] = float(model.energy(q_free.mean(axis=0)))
            metrics["ess_hybrid"][iframe] = ess / ne

            iframe += 1
            if iframe % 10 == 0 or iframe == n_frames:
                elapsed = time.time() - t0
                print(
                    f"  t={step*dt:6.2f}  RMSE_W={metrics['rmse_where'][iframe-1]:.3f}  "
                    f"XCOR_W={metrics['xcor_where'][iframe-1]:.3f}  "
                    f"RMSE_H={metrics['rmse_hybrid'][iframe-1]:.3f}  "
                    f"XCOR_F={metrics['xcor_free'][iframe-1]:.3f}  "
                    f"{elapsed:.1f}s",
                    flush=True,
                )

    # Trim in case of rounding
    psi_truth = psi_truth[:iframe]
    psi_where = psi_where[:iframe]
    psi_hybrid = psi_hybrid[:iframe]
    psi_free = psi_free[:iframe]
    q_truth_s = q_truth_s[:iframe]
    tracers = tracers[:iframe]
    times = times[:iframe]
    for k in metrics:
        metrics[k] = metrics[k][:iframe]
    n_frames = iframe

    # Spectra of the last third (assimilated regime).
    sl = slice(max(0, n_frames - n_frames // 3), n_frames)
    ks, e_t = model.spectrum(q_truth_s[sl].mean(axis=0) * 0 + q_truth_s[-1])
    # Average spectra over the last third of snapshots.
    acc_t = np.zeros_like(e_t)
    acc_w = np.zeros_like(e_t)
    acc_h = np.zeros_like(e_t)
    acc_f = np.zeros_like(e_t)
    count = 0
    for i in range(sl.start, sl.stop):
        _, et = model.spectrum(q_truth_s[i])
        # Invert mean psi back to q via -nabla^2 psi + mu psi, using spectral.
        def psi_to_q(psi):
            psih = np.fft.rfft2(psi) * model.mask
            qh = -(model.ksq + model.mu) * psih
            return np.fft.irfft2(qh, s=(n, n))

        _, ew = model.spectrum(psi_to_q(psi_where[i]))
        _, eh = model.spectrum(psi_to_q(psi_hybrid[i]))
        _, ef = model.spectrum(psi_to_q(psi_free[i]))
        acc_t += et
        acc_w += ew
        acc_h += eh
        acc_f += ef
        count += 1
    acc_t /= max(count, 1)
    acc_w /= max(count, 1)
    acc_h /= max(count, 1)
    acc_f /= max(count, 1)

    burn = max(1, n_frames // 4)
    summary = {
        "n": n,
        "ne": ne,
        "tracers": ntr,
        "dt": dt,
        "tend": args.tend,
        "dtsave": args.dtsave,
        "mu": args.mu,
        "beta": args.beta,
        "drag": args.drag,
        "nu": args.nu,
        "kf": args.kf,
        "f0": args.f0,
        "sigma_o": args.sigma_o,
        "inflation": args.inflation,
        "loc_radius": args.loc_radius,
        "e0": args.e0,
        "n_frames": n_frames,
        "elapsed_s": round(time.time() - t0, 2),
        "rmse_where_mean": float(metrics["rmse_where"][burn:].mean()),
        "rmse_hybrid_mean": float(metrics["rmse_hybrid"][burn:].mean()),
        "rmse_free_mean": float(metrics["rmse_free"][burn:].mean()),
        "xcor_where_mean": float(metrics["xcor_where"][burn:].mean()),
        "xcor_hybrid_mean": float(metrics["xcor_hybrid"][burn:].mean()),
        "xcor_free_mean": float(metrics["xcor_free"][burn:].mean()),
        "xcor_where_final": float(metrics["xcor_where"][-1]),
        "xcor_hybrid_final": float(metrics["xcor_hybrid"][-1]),
        "xcor_free_final": float(metrics["xcor_free"][-1]),
        "rmse_where_final": float(metrics["rmse_where"][-1]),
        "rmse_hybrid_final": float(metrics["rmse_hybrid"][-1]),
        "note": (
            "Demo-scale identical-twin on N=32 (thesis Table 10.1 used N=16 DA / "
            "128 truth, T=2000). Helmholtz inversion matches baro.ipynb: "
            "psihat = -qhat/(k^2+mu). Observations are noisy velocities at "
            "truth tracer sites (Alg. 5/8)."
        ),
    }
    print("SUMMARY", json.dumps({k: v for k, v in summary.items() if k != "note"}, indent=2), flush=True)
    return {
        "model": model,
        "summary": summary,
        "times": times,
        "metrics": metrics,
        "psi_truth": psi_truth,
        "psi_where": psi_where,
        "psi_hybrid": psi_hybrid,
        "psi_free": psi_free,
        "q_truth": q_truth_s,
        "tracers": tracers,
        "spectra": {
            "k": ks.tolist(),
            "E_truth": acc_t.tolist(),
            "E_where": acc_w.tolist(),
            "E_hybrid": acc_h.tolist(),
            "E_free": acc_f.tolist(),
        },
    }


def export_outputs(result: dict, panel_size: int = 288, skip_gif: bool = False) -> None:
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    OUT_MEDIA.mkdir(parents=True, exist_ok=True)
    OUT_RESEARCH.mkdir(parents=True, exist_ok=True)
    FRAME_DIR.mkdir(parents=True, exist_ok=True)

    psi_t = result["psi_truth"]
    psi_w = result["psi_where"]
    psi_h = result["psi_hybrid"]
    psi_f = result["psi_free"]
    q_t = result["q_truth"]
    tracers = result["tracers"]
    n_frames, n, _ = psi_t.shape

    # Symmetric colour limits from truth percentiles so panels share a scale.
    lim_psi = float(np.percentile(np.abs(psi_t), 98))
    lim_q = float(np.percentile(np.abs(q_t), 98))
    vmin_psi, vmax_psi = -lim_psi, lim_psi
    vmin_q, vmax_q = -lim_q, lim_q

    # Compact JSON for the website.
    payload = {
        "meta": result["summary"],
        "times": [round(float(t), 4) for t in result["times"]],
        "metrics": {k: [round(float(x), 5) for x in v] for k, v in result["metrics"].items()},
        "spectra": result["spectra"],
        "fields": {
            "n": n,
            "n_frames": n_frames,
            "vmin_psi": vmin_psi,
            "vmax_psi": vmax_psi,
            "vmin_q": vmin_q,
            "vmax_q": vmax_q,
            "encoding": "uint8-base64-row-major",
            "psi_truth": base64.b64encode(quantize_stack(psi_t, vmin_psi, vmax_psi)).decode("ascii"),
            "psi_where": base64.b64encode(quantize_stack(psi_w, vmin_psi, vmax_psi)).decode("ascii"),
            "psi_hybrid": base64.b64encode(quantize_stack(psi_h, vmin_psi, vmax_psi)).decode("ascii"),
            "psi_free": base64.b64encode(quantize_stack(psi_f, vmin_psi, vmax_psi)).decode("ascii"),
            "q_truth": base64.b64encode(quantize_stack(q_t, vmin_q, vmax_q)).decode("ascii"),
        },
        "tracers": np.round(tracers, 4).tolist(),
    }
    run_path = OUT_DATA / "run.json"
    run_path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {run_path} ({run_path.stat().st_size/1024:.0f} KB)", flush=True)

    (OUT_RESEARCH / "metrics_summary.json").write_text(json.dumps(result["summary"], indent=2))

    if skip_gif:
        print("skipping GIF export", flush=True)
        return

    # PNG frames for GIFs.
    for p in FRAME_DIR.glob("*.png"):
        p.unlink()

    for i in range(n_frames):
        rgb_t = overlay_tracers(
            field_to_rgb(psi_t[i], vmin_psi, vmax_psi, panel_size),
            tracers[i, :, 0],
            tracers[i, :, 1],
            n,
        )
        rgb_w = overlay_tracers(
            field_to_rgb(psi_w[i], vmin_psi, vmax_psi, panel_size),
            tracers[i, :, 0],
            tracers[i, :, 1],
            n,
        )
        rgb_h = field_to_rgb(psi_h[i], vmin_psi, vmax_psi, panel_size)
        rgb_f = field_to_rgb(psi_f[i], vmin_psi, vmax_psi, panel_size)
        err = psi_w[i] - psi_t[i]
        rgb_e = field_to_rgb(err, vmin_psi, vmax_psi, panel_size)
        rgb_q = field_to_rgb(q_t[i], vmin_q, vmax_q, panel_size)

        trip = hstack_images(
            [
                panel_label(rgb_t, "TRUTH  psi"),
                panel_label(rgb_w, "WHERE EnKF  psi"),
                panel_label(rgb_h, "HYBRID EnKF-PF  psi"),
            ]
        )
        trip.save(FRAME_DIR / f"cmp_{i:04d}.png")

        err_panel = hstack_images(
            [
                panel_label(rgb_t, "TRUTH  psi"),
                panel_label(rgb_w, "WHERE"),
                panel_label(rgb_e, "ERROR  where - truth"),
            ]
        )
        err_panel.save(FRAME_DIR / f"err_{i:04d}.png")

        base = hstack_images(
            [
                panel_label(rgb_t, "TRUTH"),
                panel_label(rgb_w, "WHERE"),
                panel_label(rgb_f, "FREE RUN (no DA)"),
            ]
        )
        base.save(FRAME_DIR / f"free_{i:04d}.png")

        vort = hstack_images(
            [
                panel_label(rgb_q, "TRUTH  vorticity q"),
                panel_label(rgb_t, "TRUTH  streamfunction"),
                panel_label(rgb_w, "WHERE  streamfunction"),
            ]
        )
        vort.save(FRAME_DIR / f"vort_{i:04d}.png")

    write_gif_from_pngs(FRAME_DIR / "cmp_%04d.png", OUT_MEDIA / "psi_compare.gif")
    write_gif_from_pngs(FRAME_DIR / "err_%04d.png", OUT_MEDIA / "psi_error.gif")
    write_gif_from_pngs(FRAME_DIR / "free_%04d.png", OUT_MEDIA / "psi_free.gif")
    write_gif_from_pngs(FRAME_DIR / "vort_%04d.png", OUT_MEDIA / "vorticity.gif")
    print("gifs:", list(OUT_MEDIA.glob("*.gif")), flush=True)

    # Keep a handful of stills for the site in case GIFs are heavy.
    still_dir = OUT_MEDIA
    for name, idx in (("still_early.png", 2), ("still_mid.png", n_frames // 2), ("still_late.png", n_frames - 1)):
        src = FRAME_DIR / f"cmp_{idx:04d}.png"
        if src.exists():
            Image.open(src).save(still_dir / name)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Barotropic QG Lagrangian EnKF")
    p.add_argument("--n", type=int, default=32)
    p.add_argument("--ne", type=int, default=24)
    p.add_argument("--tracers", type=int, default=40)
    p.add_argument("--dt", type=float, default=0.02)
    p.add_argument("--tend", type=float, default=28.0)
    p.add_argument("--tspin", type=float, default=8.0)
    p.add_argument("--dtsave", type=float, default=0.35)
    p.add_argument("--mu", type=float, default=0.05)
    p.add_argument("--beta", type=float, default=0.05)
    p.add_argument("--drag", type=float, default=0.08)
    p.add_argument("--nu", type=float, default=3.5e-4)
    p.add_argument("--kf", type=int, default=4)
    p.add_argument("--f0", type=float, default=0.16)
    p.add_argument("--e0", type=float, default=0.8)
    p.add_argument("--sigma-o", dest="sigma_o", type=float, default=0.04)
    p.add_argument("--inflation", type=float, default=1.08)
    p.add_argument("--loc-radius", dest="loc_radius", type=float, default=1.55)
    p.add_argument("--ens-amp", dest="ens_amp", type=float, default=0.55)
    p.add_argument("--seed", type=int, default=2025)
    p.add_argument("--skip-gif", action="store_true")
    return p.parse_args(argv)


def main() -> int:
    args = parse_args()
    result = run_experiment(args)
    export_outputs(result, skip_gif=args.skip_gif)
    xcor = result["summary"]["xcor_where_mean"]
    rmse = result["summary"]["rmse_where_mean"]
    print(f"done  WHERE  mean XCOR={xcor:.3f}  mean RMSE={rmse:.3f}", flush=True)
    if xcor < 0.55:
        print("WARNING: reconstruction weaker than expected; check localisation / inflation.", flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
