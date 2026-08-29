export type RunMeta = {
  n: number;
  ne: number;
  tracers: number;
  dt: number;
  tend: number;
  dtsave: number;
  mu: number;
  beta: number;
  drag: number;
  nu: number;
  kf: number;
  f0: number;
  sigma_o: number;
  inflation: number;
  loc_radius: number;
  e0: number;
  n_frames: number;
  elapsed_s: number;
  rmse_where_mean: number;
  rmse_hybrid_mean: number;
  rmse_free_mean: number;
  xcor_where_mean: number;
  xcor_hybrid_mean: number;
  xcor_free_mean: number;
  xcor_where_final: number;
  xcor_hybrid_final: number;
  xcor_free_final: number;
  rmse_where_final: number;
  rmse_hybrid_final: number;
  note: string;
};

export type RunData = {
  meta: RunMeta;
  times: number[];
  metrics: Record<string, number[]>;
  spectra: {
    k: number[];
    E_truth: number[];
    E_where: number[];
    E_hybrid: number[];
    E_free: number[];
  };
  fields: {
    n: number;
    n_frames: number;
    vmin_psi: number;
    vmax_psi: number;
    vmin_q: number;
    vmax_q: number;
    encoding: string;
    psi_truth: string;
    psi_where: string;
    psi_hybrid: string;
    psi_free: string;
    q_truth: string;
  };
  tracers: number[][][];
};

export type FieldKey = "psi_truth" | "psi_where" | "psi_hybrid" | "psi_free" | "q_truth";

export function decodeBase64U8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function fieldSlice(bytes: Uint8Array, frame: number, n: number): Uint8Array {
  const size = n * n;
  return bytes.subarray(frame * size, (frame + 1) * size);
}
