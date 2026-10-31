"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";

export type SeriesPoint = { month: string; invoiced: string; collected: string };

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

/** Invoiced vs collected per month. Strings from the API are only converted to numbers to position bars. */
export function RevenueChart({ data }: { data: SeriesPoint[] }) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), invoiced: Number(d.invoiced), collected: Number(d.collected) }));
  return (
    <div className="h-[240px]">
      <table className="sr-only">
        <caption>Invoiced and collected revenue per month</caption>
        <thead>
          <tr><th>Month</th><th>Invoiced</th><th>Collected</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}><td>{d.month}</td><td>{formatMoney(d.invoiced)}</td><td>{formatMoney(d.collected)}</td></tr>
          ))}
        </tbody>
      </table>
      <div aria-hidden className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={3} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--line)" }} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
          <YAxis width={44} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip
            cursor={{ fill: "var(--brand-soft)" }}
            formatter={(v) => formatMoney(Number(v))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow-float)" }}
          />
          <Bar dataKey="invoiced" name="Invoiced" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="collected" name="Collected" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
