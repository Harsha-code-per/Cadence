"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Receipt } from "lucide-react";

import { CycleRing } from "@/components/data/CycleRing";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Paginated } from "@/lib/api";
import { formatMoney } from "@/lib/format";

interface PortalSummary {
  customer: {
    id: number;
    name: string;
    company: string;
    email: string;
  };
  active_subscriptions: number;
  next_invoice_date: string | null;
  outstanding: string;
  recent_invoices: Array<{
    id: number;
    number: string;
    status: string;
    invoice_date: string;
    due_date: string;
    total: string;
    amount_paid: string;
    outstanding: string;
  }>;
  recent_payments: Array<{
    id: number;
    number: string;
    method: string;
    amount: string;
    payment_date: string;
    reference: string;
  }>;
}

interface SubscriptionItem {
  id: number;
  number: string;
  status: string;
  plan: { id: number; name: string; billing_period: string; interval_count: number };
  start_date: string;
  next_invoice_date: string | null;
  recurring_total?: string;
  allowed_actions?: string[];
}

export default function PortalPage() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["portal-summary"],
    queryFn: () => api.get<PortalSummary>("/portal/summary/"),
    staleTime: 30_000,
  });

  const { data: subsData, isLoading: loadingSubs } = useQuery({
    queryKey: ["portal-subscriptions"],
    queryFn: () => api.get<Paginated<SubscriptionItem>>("/subscriptions/"),
    staleTime: 30_000,
  });

  const subscriptions = subsData?.results ?? [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {loadingSummary || !summary ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                Customer Portal
              </span>
              <h1 className="font-display text-2xl font-bold text-ink">
                Welcome, {summary.customer.name}
              </h1>
              {summary.customer.company && (
                <p className="text-sm text-ink-2">{summary.customer.company}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-line bg-canvas p-3 text-right">
                <span className="text-xs text-ink-2">Total Outstanding</span>
                <p className="font-mono text-lg font-bold text-rose">
                  {formatMoney(summary.outstanding)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subscriptions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Your Subscriptions</h2>
            <p className="text-xs text-ink-2">Active service and product contracts</p>
          </div>
        </div>

        {loadingSubs ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-2">
            No active subscriptions found for this account.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-ink">{sub.number}</span>
                    <StatusBadge domain="subscription" status={sub.status} />
                  </div>

                  <div>
                    <h3 className="font-display text-base font-semibold text-ink">
                      {sub.plan.name}
                    </h3>
                    <p className="text-xs capitalize text-ink-2">
                      Billed {sub.plan.billing_period}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <CycleRing
                      progress={0.65}
                      size={54}
                      caption={
                        sub.next_invoice_date
                          ? `Next bill: ${sub.next_invoice_date}`
                          : "Current cycle"
                      }
                    />

                    {sub.recurring_total && (
                      <div className="text-right">
                        <span className="text-xs text-ink-3">Recurring</span>
                        <p className="font-mono font-bold text-teal">
                          {formatMoney(sub.recurring_total)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Invoices Section */}
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Invoices & Statements</h2>
          <p className="text-xs text-ink-2">Payment history and open invoices</p>
        </div>

        {loadingSummary || !summary ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : summary.recent_invoices.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-2">
            No invoices issued yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="divide-y divide-line text-sm">
              {summary.recent_invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-canvas text-brand">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-mono font-semibold text-ink">{inv.number}</p>
                      <p className="text-xs text-ink-2">
                        Issued {inv.invoice_date} • Due {inv.due_date}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <StatusBadge domain="invoice" status={inv.status} />

                    <div className="text-right">
                      <p className="font-mono font-semibold text-ink">
                        {formatMoney(inv.total)}
                      </p>
                      {parseFloat(inv.outstanding) > 0 && inv.status !== "paid" && (
                        <p className="text-xs font-medium text-rose">
                          Due: {formatMoney(inv.outstanding)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Receipts Section */}
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Payment Receipts</h2>
          <p className="text-xs text-ink-2">Settled transactions and receipts</p>
        </div>

        {loadingSummary || !summary ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : summary.recent_payments.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-2">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="divide-y divide-line text-sm">
              {summary.recent_payments.map((pmt) => (
                <div
                  key={pmt.id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-mono font-semibold text-ink">{pmt.number}</p>
                      <p className="text-xs text-ink-2">
                        {pmt.payment_date} • {pmt.method.toUpperCase().replace("_", " ")}
                        {pmt.reference ? ` • Ref: ${pmt.reference}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-mono font-semibold text-teal">
                      {formatMoney(pmt.amount)}
                    </p>
                    <span className="inline-block rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                      Success
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
