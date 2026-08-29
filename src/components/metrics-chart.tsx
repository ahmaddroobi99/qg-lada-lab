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

type Props = {
  data: RunData;
  keys: Array<{ key: string; name: string; color: string }>;
  yDomain?: [number, number];
  yLabel: string;
};

export function MetricsChart({ data, keys, yDomain, yLabel }: Props) {
  const rows = data.times.map((t, i) => {
    const row: Record<string, number> = { t };
    for (const k of keys) row[k.key] = data.metrics[k.key]?.[i] ?? 0;
    return row;
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" className="text-line" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            tick={{ fill: "#8b96a4", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#232a33" }}
          />
          <YAxis
            domain={yDomain}
            tick={{ fill: "#8b96a4", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#232a33" }}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "#171d26",
              border: "1px solid #232a33",
              borderRadius: 8,
              fontSize: 12,
              color: "#e6edf3",
            }}
            labelFormatter={(v) => `t = ${Number(v).toFixed(2)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#8b96a4" }} />
          {keys.map((k) => (
            <Line
              key={k.key}
              type="monotone"
              dataKey={k.key}
              name={k.name}
              stroke={k.color}
              dot={false}
              strokeWidth={1.8}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">{yLabel} versus time</p>
    </div>
  );
}
