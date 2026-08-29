/** In-place radix-2 FFT. `inverse=false` matches numpy.fft.fft (unnormalized). */

export function fftInPlace(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j]!;
      re[j] = t!;
      t = im[i];
      im[i] = im[j]!;
      im[j] = t!;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        const vr = re[i + j + half]!;
        const vi = im[i + j + half]!;
        const vRe = vr * wRe - vi * wIm;
        const vIm = vr * wIm + vi * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
  if (inverse) {
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i]! *= s;
      im[i]! *= s;
    }
  }
}

export class SpectralGrid {
  readonly n: number;
  readonly nkx: number;
  readonly specRe: Float64Array;
  readonly specIm: Float64Array;
  readonly mask: Float64Array;
  readonly kx: Float64Array;
  readonly ky: Float64Array;
  readonly ksq: Float64Array;
  readonly kabs: Float64Array;
  private readonly rowRe: Float64Array;
  private readonly rowIm: Float64Array;
  private readonly colRe: Float64Array;
  private readonly colIm: Float64Array;

  constructor(n: number, dealias = 2 / 3) {
    if (n < 4 || (n & (n - 1)) !== 0) throw new Error("n must be a power of two");
    this.n = n;
    this.nkx = n / 2 + 1;
    const m = n * this.nkx;
    this.specRe = new Float64Array(m);
    this.specIm = new Float64Array(m);
    this.mask = new Float64Array(m);
    this.kx = new Float64Array(m);
    this.ky = new Float64Array(m);
    this.ksq = new Float64Array(m);
    this.kabs = new Float64Array(m);
    this.rowRe = new Float64Array(n);
    this.rowIm = new Float64Array(n);
    this.colRe = new Float64Array(n);
    this.colIm = new Float64Array(n);

    const k1d = new Float64Array(n);
    for (let i = 0; i < n; i++) k1d[i] = i < n / 2 ? i : i - n;
    const kcut = dealias * (n / 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < this.nkx; i++) {
        const k = j * this.nkx + i;
        const kx = k1d[i]!;
        const ky = k1d[j]!;
        this.kx[k] = kx;
        this.ky[k] = ky;
        const s = kx * kx + ky * ky;
        this.ksq[k] = s;
        const a = Math.sqrt(s);
        this.kabs[k] = a;
        this.mask[k] = a <= kcut ? 1 : 0;
      }
    }
    this.mask[0] = 0;
  }

  rfft2(src: Float64Array): void {
    const { n, nkx, rowRe, rowIm, colRe, colIm, specRe, specIm, mask } = this;
    for (let j = 0; j < n; j++) {
      const off = j * n;
      for (let i = 0; i < n; i++) {
        rowRe[i] = src[off + i]!;
        rowIm[i] = 0;
      }
      fftInPlace(rowRe, rowIm, false);
      const so = j * nkx;
      for (let i = 0; i < nkx; i++) {
        specRe[so + i] = rowRe[i]!;
        specIm[so + i] = rowIm[i]!;
      }
    }
    for (let i = 0; i < nkx; i++) {
      for (let j = 0; j < n; j++) {
        colRe[j] = specRe[j * nkx + i]!;
        colIm[j] = specIm[j * nkx + i]!;
      }
      fftInPlace(colRe, colIm, false);
      for (let j = 0; j < n; j++) {
        specRe[j * nkx + i] = colRe[j]!;
        specIm[j * nkx + i] = colIm[j]!;
      }
    }
    for (let k = 0; k < specRe.length; k++) {
      specRe[k]! *= mask[k]!;
      specIm[k]! *= mask[k]!;
    }
  }

  irfft2(dst: Float64Array): void {
    const { n, nkx, rowRe, rowIm, colRe, colIm, specRe, specIm } = this;
    for (let i = 0; i < nkx; i++) {
      for (let j = 0; j < n; j++) {
        colRe[j] = specRe[j * nkx + i]!;
        colIm[j] = specIm[j * nkx + i]!;
      }
      fftInPlace(colRe, colIm, true);
      for (let j = 0; j < n; j++) {
        specRe[j * nkx + i] = colRe[j]!;
        specIm[j * nkx + i] = colIm[j]!;
      }
    }
    const nyq = nkx - 1;
    for (let j = 0; j < n; j++) {
      const so = j * nkx;
      rowRe[0] = specRe[so]!;
      rowIm[0] = specIm[so]!;
      for (let i = 1; i < nyq; i++) {
        rowRe[i] = specRe[so + i]!;
        rowIm[i] = specIm[so + i]!;
        rowRe[n - i] = specRe[so + i]!;
        rowIm[n - i] = -specIm[so + i]!;
      }
      rowRe[n / 2] = specRe[so + nyq]!;
      rowIm[n / 2] = specIm[so + nyq]!;
      fftInPlace(rowRe, rowIm, true);
      const off = j * n;
      for (let i = 0; i < n; i++) dst[off + i] = rowRe[i]!;
    }
  }
}
