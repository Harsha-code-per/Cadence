"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight } from "lucide-react";

import { KpiTile } from "@/components/data/KpiTile";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { formatMoney } from "@/lib/format";

interface SummaryData {
  active_subscriptions: number;
  mrr: string;
  arr: string;
  invoiced: string;
  collected: string;
  outstanding: string;
  overdue_count: number;
  overdue_amount: string;
}

interface StatusBreakdownData {
  subscriptions: Record<string, number>;
  invoices: Record<string, number>;
}

interface InvoiceItem {
  id: number;
  number: string;
  customer_name: string;
  due_date: string;
  total: string;
  amount_paid: string;
  outstanding: string;
  status: string;
}

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => api.get<SummaryData>("/analytics/summary/"),
    staleTime: 60_000,
  });

  const { data: series = [], isLoading: loadingSeries } = useQuery({
    queryKey: ["analytics-revenue-series"],
    queryFn: () => api.get<Array<{ month: string; invoiced: string; collected: string }>>("/analytics/revenue-series/"),
    staleTime: 60_000,
  });

  const { data: breakdown, isLoading: loadingBreakdown } = useQuery({
    queryKey: ["analytics-status-breakdown"],
    queryFn: () => api.get<StatusBreakdownData>("/analytics/status-breakdown/"),
    staleTime: 60_000,
  });

  const { data: overdueData } = useQuery({
    queryKey: ["invoices", "overdue"],
    queryFn: () => api.get<Paginated<InvoiceItem>>("/invoices/?overdue=true&page_size=5"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Real-time recurring revenue, cash collections, and subscription metrics."
      />

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingSummary || !summary ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))
        ) : (
          <>
            <KpiTile
              label="Active Subscriptions"
              value={summary.active_subscriptions.toLocaleString()}
              delta="All recurring accounts"
              deltaTone="teal"
            />
            <KpiTile
              label="Monthly Recurring Revenue"
              value={formatMoney(summary.mrr)}
              delta={`ARR: ${formatMoney(summary.arr)}`}
              deltaTone="teal"
            />
            <KpiTile
              label="Collected Revenue"
              value={formatMoney(summary.collected)}
              delta={`Invoiced: ${formatMoney(summary.invoiced)}`}
              deltaTone="teal"
            />
            <KpiTile
              label="Outstanding Balance"
              value={formatMoney(summary.outstanding)}
              delta={
                summary.overdue_count > 0
                  ? `${summary.overdue_count} overdue (${formatMoney(summary.overdue_amount)})`
                  : "All payments up to date"
              }
              deltaTone={summary.overdue_count > 0 ? "rose" : "teal"}
            />
          </>
        )}
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Revenue Performance</h2>
            <p className="text-xs text-ink-2">Monthly invoiced revenue vs. actual cash collected</p>
          </div>
          <span className="rounded bg-canvas px-2 py-1 text-xs font-medium text-ink-2">
            Last 12 months
          </span>
        </div>
        {loadingSeries ? (
          <Skeleton className="mt-4 h-72 w-full" />
        ) : (
          <RevenueChart data={series} />
        )}
      </div>

      {/* Bottom Grid: Status Breakdown & Overdue Invoices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Breakdown */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold text-ink">System Status Breakdown</h2>
          <p className="mb-4 text-xs text-ink-2">Current state distribution</p>

          {loadingBreakdown || !breakdown ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-2">
                  Subscriptions
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(breakdown.subscriptions).map(([st, cnt]) => (
                    <div
                      key={st}
                      className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-3 py-1.5"
                    >
                      <StatusBadge domain="subscription" status={st} />
                      <span className="font-mono text-sm font-semibold text-ink">{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-2">
                  Invoices
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(breakdown.invoices).map(([st, cnt]) => (
                    <div
                      key={st}
                      className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-3 py-1.5"
                    >
                      <StatusBadge domain="invoice" status={st} />
                      <span className="font-mono text-sm font-semibold text-ink">{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Overdue Invoices Alert Panel */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose" />
              <div>
                <h2 className="font-display text-base font-semibold text-ink">Overdue Invoices</h2>
                <p className="text-xs text-ink-2">Invoices past due date requiring collection</p>
              </div>
            </div>
            <Link
              href="/invoices?overdue=true"
              className="inline-flex items-center gap-1 text-xs font-medium text-plum hover:underline"
            >
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {overdueData && overdueData.results.length > 0 ? (
            <div className="divide-y divide-line text-sm">
              {overdueData.results.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-ink hover:text-plum hover:underline"
                    >
                      {inv.number}
                    </Link>
                    <p className="text-xs text-ink-2">Due on {inv.due_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium text-rose">
                      {formatMoney(inv.outstanding ?? inv.total)}
                    </p>
                    <span className="text-xs text-ink-3">outstanding</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-teal">Zero overdue invoices!</p>
              <p className="text-xs text-ink-2">All customer payments are on schedule.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
