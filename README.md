# QG Lagrangian DA lab

Interactive reconstruction of the barotropic streamfunction from Lagrangian drifters.

The browser **Lab** runs a spectral quasi-geostrophic twin and a localized stochastic EnKF (WHERE, thesis Algorithm 5) with an optional hybrid EnKF–PF branch (Algorithms 8–9). Every term in

```
∂q/∂t + J(ψ, q) + β ∂ψ/∂x = F − d q − ν (−∇²)ᵖ q
q = ∇²ψ − μψ
ψ̂ = −q̂ / (κ² + μ)
```

can be switched off, and every filter knob (N_e, L, σ_o, inflation, Gaspari–Cohn radius, analysis interval, stochastic vs deterministic) is live.

Python solver (same operators, committed N = 32 run, XCOR 0.964): [`research/qg_lada.py`](research/qg_lada.py). Also in [ahmaddroobi99/QG_work](https://github.com/ahmaddroobi99/QG_work).

Thesis: Droobi, A. H. (2025). *Data-Driven Filtering Techniques for Turbulent Flow Models (A Lagrangian Data Assimilation Approach)*. MSc, University of Calgary. [Scholaris](https://ucalgary.scholaris.ca/items/b4a3d3b9-4fbf-4d1e-8e1e-80c71c009825).

## Run the Python experiment

```bash
pip install -r research/requirements.txt
python research/qg_lada.py
```

## Notes

Helmholtz inversion follows `baro.ipynb` (`ψ̂ = −q̂/(κ²+μ)`), not the unsigned formula typeset in Algorithm 5. Lab MATLAB trees `Predictive-Intelligent-Systems-Lab/SWE_LaDA` and `QGcode_first_year` 404.
