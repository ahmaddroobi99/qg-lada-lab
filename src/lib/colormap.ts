/** RdBu diverging map — scientific field colour, not brand chrome. */

const STOPS: Array<[number, number, number, number]> = [
  [0.0, 5, 48, 97],
  [0.125, 33, 102, 172],
  [0.25, 103, 169, 207],
  [0.375, 209, 229, 240],
  [0.5, 247, 247, 247],
  [0.625, 253, 219, 199],
  [0.75, 244, 165, 130],
  [0.875, 178, 24, 43],
  [1.0, 103, 0, 31],
];

export function rdbuRgb(t: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i += 1;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const u = (v - a[0]) / (b[0] - a[0] + 1e-12);
  return [
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
    Math.round(a[3] + (b[3] - a[3]) * u),
  ];
}

const LUT: Uint8ClampedArray = (() => {
  const table = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = rdbuRgb(i / 255);
    table[i * 4] = r;
    table[i * 4 + 1] = g;
    table[i * 4 + 2] = b;
    table[i * 4 + 3] = 255;
  }
  return table;
})();

export function fieldImageData(values: Uint8Array, n: number): ImageData {
  const img = new ImageData(n, n);
  const d = img.data;
  for (let i = 0; i < n * n; i++) {
    const o = values[i] * 4;
    d[i * 4] = LUT[o];
    d[i * 4 + 1] = LUT[o + 1];
    d[i * 4 + 2] = LUT[o + 2];
    d[i * 4 + 3] = 255;
  }
  return img;
}

export function paintField(
  ctx: CanvasRenderingContext2D,
  values: Uint8Array,
  n: number,
  tracers: number[][] | undefined,
  showTracers: boolean,
  size = 384,
) {
  const off = document.createElement("canvas");
  off.width = n;
  off.height = n;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.putImageData(fieldImageData(values, n), 0, 0);

  ctx.canvas.width = size;
  ctx.canvas.height = size;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, size, size);

  if (!showTracers || !tracers) return;
  for (const [x, y] of tracers) {
    const px = (x / (2 * Math.PI)) * size;
    const py = (y / (2 * Math.PI)) * size;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.8, size / 90), 0, Math.PI * 2);
    ctx.fillStyle = "#111418";
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#ece8dc";
    ctx.stroke();
  }
}
