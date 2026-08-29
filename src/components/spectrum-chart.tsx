import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RunData } from "@/lib/run-data";

export function SpectrumChart({ data }: { data: RunData }) {
  const rows = data.spectra.k
    .map((k, i) => ({
      k,
      truth: data.spectra.E_truth[i],
      where: data.spectra.E_where[i],
      hybrid: data.spectra.E_hybrid[i],
      free: data.spectra.E_free[i],
    }))
    .filter((r) => r.k >= 1 && r.truth > 0);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#232a33" strokeDasharray="3 3" />
          <XAxis
            dataKey="k"
            tick={{ fill: "#8b96a4", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#232a33" }}
          />
          <YAxis
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fill: "#8b96a4", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#232a33" }}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#171d26",
              border: "1px solid #232a33",
              borderRadius: 8,
              fontSize: 12,
              color: "#e6edf3",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="truth" name="Truth" stroke="#e6edf3" dot={false} strokeWidth={1.8} isAnimationActive={false} />
          <Line dataKey="where" name="WHERE" stroke="#8ea4bc" dot={false} strokeWidth={1.8} isAnimationActive={false} />
          <Line dataKey="hybrid" name="Hybrid" stroke="#b7c4d4" dot={false} strokeWidth={1.6} isAnimationActive={false} />
          <Line dataKey="free" name="Free" stroke="#5c6774" dot={false} strokeWidth={1.4} strokeDasharray="4 3" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
