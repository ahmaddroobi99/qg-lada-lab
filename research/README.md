# Barotropic QG Lagrangian data assimilation

Python reconstruction of the QG experiment in

> Droobi, A. H. (2025). *Data-Driven Filtering Techniques for Turbulent Flow Models
> (A Lagrangian Data Assimilation Approach)*. MSc thesis, University of Calgary.

The public MATLAB trees `Predictive-Intelligent-Systems-Lab/SWE_LaDA` and
`QGcode_first_year` 404. This solver follows Algorithms 5 and 8 of the thesis and
the working spectral operators in `baro.ipynb`
(`ahmaddroobi99/UQ_QG_LOU_models_MS_code_process`):

```
q = ∇²ψ − μψ
ψ̂ = −q̂ / (κ² + μ)          # notebook sign, not the unsigned Alg. 5 typesetting
u = (−∂ψ/∂y, ∂ψ/∂x)
```

## Experiment

Identical twin on `[0, 2π]²`:

1. Spin up a Kolmogorov barotropic truth.
2. Advect `L` periodic tracers; observe noisy velocities at those sites.
3. WHERE: localized stochastic EnKF on vorticity (Gaspari–Cohn + inflation).
4. Hybrid: EnKF then systematic resampling (Alg. 8–9).
5. Free-run ensemble as the no-DA control.

Default demo (`python research/qg_lada.py`):

| | this run | thesis Table 10.1 |
|---|---|---|
| N | 32 | 16 (DA) / 128 truth |
| N_e | 24 | — |
| L | 40 | 20 / 40 |
| Δt | 0.02 | 0.02 |
| T | 28 | 2000 |
| σ_o | 0.04 | 0.01–0.1 |

## Outputs

- `public/data/run.json` — packed frames + RMSE/XCOR/spectra for the website
- `public/media/*.gif` — animated ψ / error / vorticity
- `research/metrics_summary.json` — scalar diagnostics

## Dependencies

Python 3.11+, `numpy`, `pillow`. `ffmpeg` for GIFs. No scipy/matplotlib.
