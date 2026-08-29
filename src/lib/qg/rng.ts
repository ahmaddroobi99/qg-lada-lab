/** Seeded RNG (mulberry32 + Box–Muller). Reproducible across restarts. */

export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 1;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(a = 0, b = 1): number {
    return a + (b - a) * this.next();
  }

  normal(mean = 0, std = 1): number {
    if (this.spare !== null) {
      const z = this.spare;
      this.spare = null;
      return mean + std * z;
    }
    let u = 0;
    let v = 0;
    let r = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      r = u * u + v * v;
    } while (r === 0 || r >= 1);
    const m = Math.sqrt((-2 * Math.log(r)) / r);
    this.spare = v * m;
    return mean + std * u * m;
  }
}
