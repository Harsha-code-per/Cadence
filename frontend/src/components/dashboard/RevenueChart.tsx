"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/format";

interface RevenueItem {
  month: string;
  invoiced: string;
  collected: string;
}

export function RevenueChart({ data }: { data: RevenueItem[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    invoiced: parseFloat(d.invoiced) || 0,
    collected: parseFloat(d.collected) || 0,
  }));

  return (
    <div className="h-72 w-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="month"
            stroke="var(--ink-3)"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
          />
          <YAxis
            stroke="var(--ink-3)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--line)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value) => [typeof value === "number" || typeof value === "string" ? formatMoney(value) : "—", ""]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: "10px", fontSize: "12px" }}
          />
          <Bar
            dataKey="invoiced"
            name="Invoiced"
            fill="var(--plum)"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Line
            type="monotone"
            dataKey="collected"
            name="Collected"
            stroke="var(--teal)"
            strokeWidth={3}
            dot={{ r: 4, fill: "var(--teal)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
