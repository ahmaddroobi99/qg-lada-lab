"""Compare numpy rfft2 / Helmholtz invert against a known field."""
import json
import math
import numpy as np

N = 16
TWO_PI = 2 * math.pi
mu = 0.05
dx = TWO_PI / N
x = np.arange(N) * dx
xx, yy = np.meshgrid(x, x)
q = np.sin(2 * xx) + 0.3 * np.cos(3 * yy)

kx = np.fft.fftfreq(N, d=1.0 / N)
kxr = kx[: N // 2 + 1]
kxg, kyg = np.meshgrid(kxr, kx)
ksq = kxg**2 + kyg**2
inv = np.zeros_like(ksq)
den = ksq + mu
np.divide(-1.0, den, out=inv, where=den > 1e-14)
inv[0, 0] = 0.0
qh = np.fft.rfft2(q)
psih = qh * inv
uh = -1j * kyg * psih
vh = 1j * kxg * psih
psi = np.fft.irfft2(psih, s=(N, N))
u = np.fft.irfft2(uh, s=(N, N))
v = np.fft.irfft2(vh, s=(N, N))

print(json.dumps({
    "q": q.ravel().tolist(),
    "psi": psi.ravel().tolist(),
    "u": u.ravel().tolist(),
    "v": v.ravel().tolist(),
    "qh_re": qh.real.ravel().tolist(),
    "qh_im": qh.imag.ravel().tolist(),
}))
