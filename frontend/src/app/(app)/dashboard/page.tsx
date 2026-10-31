"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { KpiTile } from "@/components/data/KpiTile";
import { Money } from "@/components/data/Money";
import { RevenueChart, type SeriesPoint } from "@/components/dashboard/RevenueChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { useOptions } from "@/lib/crud";
import { formatMoney } from "@/lib/format";
import type { components } from "@/lib/api-types";

type Summary = {
  active_subscriptions: number;
  mrr: string;
  arr: string;
  invoiced: string;
  collected: string;
  outstanding: string;
  overdue_count: number;
  overdue_amount: string;
};
type Breakdown = { subscriptions?: Record<string, number>; invoices?: Record<string, number> };
type OverdueInvoice = { id: number; number: string; customer?: { name: string; company?: string }; outstanding?: string };
type Plan = components["schemas"]["Plan"];

// Status → token, per docs/DESIGN.md "Status mapping" (never generic chart colours: green must mean active/paid).
const STATUS_COLOR: Record<string, string> = {
  draft: "var(--slate)",
  quotation: "var(--plum)",
  confirmed: "var(--plum)",
  active: "var(--teal)",
  paid: "var(--teal)",
  paused: "var(--amber)",
  closed: "var(--ink-3)",
  cancelled: "var(--ink-3)",
  overdue: "var(--rose)",
};
const colorOf = (status: string) => STATUS_COLOR[status] ?? "var(--slate)";

const selectCls =
  "h-11 rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

function Panel({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-[17px] font-semibold leading-tight">{title}</h2>
        {legend}
      </div>
      {children}
    </section>
  );
}

const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: color }} />
    {label}
  </span>
);

export default function DashboardPage() {
  const [months, setMonths] = useState("12");
  const [plan, setPlan] = useState("");
  const plans = useOptions<Plan>("plans");

  const summary = useQuery({ queryKey: ["analytics", "summary", plan], queryFn: () => api.get<Summary>("/analytics/summary/", { plan: plan || undefined }) });
  const series = useQuery({ queryKey: ["analytics", "series", months], queryFn: () => api.get<SeriesPoint[]>("/analytics/revenue-series/", { months }) });
  const breakdown = useQuery({ queryKey: ["analytics", "status"], queryFn: () => api.get<Breakdown>("/analytics/status-breakdown/") });
  const overdue = useQuery({ queryKey: ["invoices", "overdue"], queryFn: () => api.get<Paginated<OverdueInvoice>>("/invoices/", { overdue: true, page_size: 5 }) });

  const s = summary.data;
  const kpis = [
    { label: "Active subscriptions", value: s ? s.active_subscriptions.toLocaleString("en-IN") : "—" },
    { label: "Monthly recurring revenue", value: s ? formatMoney(s.mrr) : "—", delta: s ? `ARR ${formatMoney(s.arr)}` : undefined },
    { label: "Collected", value: s ? formatMoney(s.collected) : "—", delta: s ? `of ${formatMoney(s.invoiced)} invoiced` : undefined },
    { label: "Outstanding", value: s ? formatMoney(s.outstanding) : "—", delta: s && s.overdue_count ? `${s.overdue_count} overdue · ${formatMoney(s.overdue_amount)}` : undefined, deltaTone: "rose" as const },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        description={plan ? "Filtered to one plan" : "All plans"}
        actions={
          <>
            <select aria-label="Revenue range" className={selectCls} value={months} onChange={(e) => setMonths(e.target.value)}>
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </select>
            <select aria-label="Plan" className={selectCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">All plans</option>
              {plans.data?.results.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        }
      />

      {summary.isError ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState message="The finance summary isn't available yet." />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {kpis.map((k) => (k.value === "—" && summary.isLoading ? <Skeleton key={k.label} className="h-[118px] rounded-lg" /> : <KpiTile key={k.label} {...k} />))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-4">
        <div className="min-w-0 flex-[2_1_560px]">
          <Panel
            title="Invoiced and collected"
            legend={
              <span className="flex gap-4 text-[13px] text-ink-2">
                <Swatch color="var(--plum)" label="Invoiced" />
                <Swatch color="var(--teal)" label="Collected" />
              </span>
            }
          >
            {series.isLoading ? <Skeleton className="h-[240px]" /> : series.data && series.data.length ? <RevenueChart data={series.data} /> : <EmptyState message="No invoices in this range yet." />}
          </Panel>
        </div>

        <div className="min-w-0 flex-[1_1_300px]">
          <Panel title="Status breakdown">
            {breakdown.isLoading ? (
              <Skeleton className="h-40" />
            ) : breakdown.data ? (
              <div className="flex flex-col gap-5 text-sm">
                {(["subscriptions", "invoices"] as const).map((k) => {
                  const rows = Object.entries(breakdown.data?.[k] ?? {});
                  const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
                  return (
                    <div key={k} className="flex flex-col gap-2">
                      <span className="text-ink-2">{k === "subscriptions" ? "Subscriptions" : "Invoices"}</span>
                      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-line" role="img" aria-label={`${k} by status`}>
                        {rows.map(([status, n]) => (
                          <span key={status} style={{ width: `${(n / total) * 100}%`, background: colorOf(status) }} title={`${status}: ${n}`} />
                        ))}
                      </div>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                        {rows.map(([status, n]) => (
                          <li key={status} className="inline-flex items-center gap-1.5">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: colorOf(status) }} />
                            <span className="capitalize">{status}</span> <span className="tabular-nums text-ink-2">{n.toLocaleString("en-IN")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No data yet." />
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Panel title="Overdue invoices" legend={<Link href="/invoices?overdue=true" className="text-sm text-plum hover:underline">View all</Link>}>
          {overdue.isLoading ? (
            <Skeleton className="h-24" />
          ) : overdue.data && overdue.data.results.length ? (
            <ul className="divide-y">
              {overdue.data.results.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-plum hover:underline">{inv.number}</Link>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{inv.customer?.company || inv.customer?.name}</span>
                  <span className="font-medium text-rose"><Money value={inv.outstanding} /></span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message={overdue.isError ? "Overdue invoices couldn't be loaded." : "Nothing is overdue."} />
          )}
        </Panel>
      </div>
    </>
  );
}
