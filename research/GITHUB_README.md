# QG Lagrangian data assimilation

Python reconstruction of the quasi-geostrophic experiment in

> Droobi, A. H. (2025). *Data-Driven Filtering Techniques for Turbulent Flow Models
> (A Lagrangian Data Assimilation Approach)*. MSc thesis, University of Calgary.
> https://ucalgary.scholaris.ca/items/b4a3d3b9-4fbf-4d1e-8e1e-80c71c009825

The public MATLAB trees `Predictive-Intelligent-Systems-Lab/SWE_LaDA` and
`QGcode_first_year` 404. This solver follows **Algorithms 5 and 8** of the thesis
and the working spectral operators in `baro.ipynb`
(`ahmaddroobi99/UQ_QG_LOU_models_MS_code_process`).

```
q = ∇²ψ − μψ
ψ̂ = −q̂ / (κ² + μ)          # notebook sign, not the unsigned Alg. 5 typesetting
u = (−∂ψ/∂y, ∂ψ/∂x)
```

## What it does

Identical twin on the periodic β-plane `[0, 2π]²`:

1. Spin up a Kolmogorov barotropic truth.
2. Advect `L` tracers; observe **noisy velocities** at those sites (Alg. 8).
3. **WHERE** — localized stochastic EnKF on vorticity (Gaspari–Cohn + inflation).
4. **Hybrid EnKF–PF** — EnKF then systematic resampling (Alg. 8–9).
5. **Free-run** ensemble as the no-DA control.

## Demo-scale result (this repository)

| | WHERE | Hybrid | Free run |
|---|---|---|---|
| mean XCOR(ψ) | **0.964** | 0.945 | 0.316 |
| mean relative RMSE(ψ) | **0.256** | 0.367 | 0.960 |

Thesis Table 10.1 ran WHERE at N = 16 (128² truth, T = 2000). This demo is
N = 32, N_e = 24, L = 40, T = 28, Δt = 0.02. Correlation clears the thesis
target (XCOR > 0.9). Hybrid matches large-scale correlation but is slightly
worse in RMSE — the Chapter 10 conclusion on QG small scales.

## Run

```bash
python qg_lada.py
# options: --n 32 --ne 24 --tracers 40 --tend 28 --sigma-o 0.04
```

Requires `numpy`, `pillow`, and `ffmpeg` (GIFs). No scipy/matplotlib.

## Files

- `qg_lada.py` — spectral QG + WHERE + hybrid + GIF/JSON export
- `metrics_summary.json` — scalar diagnostics from the committed run
- `requirements.txt`

Animated reconstructions live with the companion website (truth / WHERE /
hybrid / free-run GIFs and an interactive replay of packed `run.json` frames).
