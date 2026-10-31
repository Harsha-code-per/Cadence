"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type Paginated } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";

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

const ACTIONS: Record<string, { label: string; done: string; ask?: string }> = {
  confirm: { label: "Accept quotation", done: "Quotation accepted." },
  pause: { label: "Pause", done: "Subscription paused.", ask: "Billing stops until you resume, and the paused days are never charged." },
  resume: { label: "Resume", done: "Subscription resumed." },
  renew: { label: "Renew", done: "Renewal quotation created." },
  close: { label: "Cancel subscription", done: "Subscription cancelled.", ask: "This ends your subscription." },
};

/** Exactly the buttons the backend says this customer may use on this plan. */
function PortalActions({ subscription }: { subscription: SubscriptionItem }) {
  const client = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null);
  const allowed = (subscription.allowed_actions ?? []).filter((name) => ACTIONS[name]);
  const run = useMutation({
    mutationFn: (name: string) => api.post(`/subscriptions/${subscription.id}/${name}/`, { note: "" }),
    onSuccess: async (_, name) => {
      setAsking(null);
      toast.success(ACTIONS[name].done);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["portal-subscriptions"] }),
        client.invalidateQueries({ queryKey: ["portal-summary"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "That didn't work. Please try again."),
  });
  if (!allowed.length) return null;

  if (asking) {
    return (
      <div className="mt-4 space-y-3 border-t border-line pt-3 text-sm">
        <p className="text-ink-2">{ACTIONS[asking].ask}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={asking === "close" ? "destructive" : "default"} disabled={run.isPending} onClick={() => run.mutate(asking)}>
            {run.isPending ? "Working…" : `Yes, ${ACTIONS[asking].label.toLowerCase()}`}
          </Button>
          {asking === "close" && allowed.includes("pause") && (
            <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate("pause")}>
              Pause instead
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
            Keep it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
      {allowed.map((name) => (
        <Button
          key={name}
          size="sm"
          variant={name === "confirm" || name === "resume" ? "default" : "outline"}
          disabled={run.isPending}
          onClick={() => (ACTIONS[name].ask ? setAsking(name) : run.mutate(name))}
        >
          {ACTIONS[name].label}
        </Button>
      ))}
    </div>
  );
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
                <p className={`tabular-nums text-lg font-bold ${Number(summary.outstanding) > 0 ? "text-rose" : "text-ink"}`}>
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
                    <span className="tabular-nums text-sm font-bold text-ink">{sub.number}</span>
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
                    <p className="text-sm text-ink-2">
                      {sub.next_invoice_date ? `Next bill ${formatDate(sub.next_invoice_date)}` : "No upcoming bill"}
                    </p>

                    {sub.recurring_total && (
                      <div className="text-right">
                        <span className="text-xs text-ink-3">Recurring</span>
                        <p className="tabular-nums font-bold text-teal">
                          {formatMoney(sub.recurring_total)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <PortalActions subscription={sub} />
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
                      <Link href={`/invoices/${inv.id}/print`} className="tabular-nums font-semibold text-brand hover:underline">
                        {inv.number}
                      </Link>
                      <p className="text-xs text-ink-2">
                        Issued {formatDate(inv.invoice_date)} · Due {formatDate(inv.due_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <StatusBadge domain="invoice" status={inv.status} />

                    <div className="text-right">
                      <p className="tabular-nums font-semibold text-ink">
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
                      <p className="tabular-nums font-semibold text-ink">{pmt.number}</p>
                      <p className="text-xs text-ink-2">
                        {formatDate(pmt.payment_date)} · {pmt.method.toUpperCase().replace("_", " ")}
                        {pmt.reference ? ` · Ref: ${pmt.reference}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="tabular-nums font-semibold text-teal">
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
