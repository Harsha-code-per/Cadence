"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, HelpCircle, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data/EmptyState";
import { Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { sentence } from "@/components/invoices/format";
import type { InvoiceDetail } from "@/components/invoices/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function InvoiceChangesDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-invoice-detail", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}/`),
    enabled: invoiceId !== null,
  });

  return (
    <Dialog open={invoiceId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Why this bill changed</DialogTitle>
          <DialogDescription>
            {invoice ? `Invoice ${invoice.number} · Compared with the previous invoice` : "Comparing with the previous invoice"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            message="Could not load bill changes."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : invoice ? (
          <div className="space-y-4 py-2">
            {invoice.changes.length === 0 ? (
              <div className="rounded-lg border border-line bg-canvas p-4 text-center text-sm text-ink-2">
                No differences from the previous invoice for this subscription.
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface p-3">
                {invoice.changes.map((change, index) => (
                  <li key={`${change.kind}-${index}`} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <div className="mb-1">
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                          {sentence(change.kind)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-2">{change.description}</p>
                    </div>
                    <Money value={change.amount_delta} className="shrink-0 text-sm font-semibold" />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-ink-2">
              <span>Period: {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</span>
              <Link
                href={`/invoices/${invoice.id}/print`}
                className="font-medium text-brand hover:underline"
              >
                View printable invoice →
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function PortalPage() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const {
    data: summary,
    isLoading: loadingSummary,
    isError: errorSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["portal-summary"],
    queryFn: () => api.get<PortalSummary>("/portal/summary/"),
    staleTime: 30_000,
  });

  const {
    data: subsData,
    isLoading: loadingSubs,
    isError: errorSubs,
    refetch: refetchSubs,
  } = useQuery({
    queryKey: ["portal-subscriptions"],
    queryFn: () => api.get<Paginated<SubscriptionItem>>("/subscriptions/"),
    staleTime: 30_000,
  });

  const subscriptions = subsData?.results ?? [];

  const isOverdue = (inv: { status: string; due_date: string; outstanding: string }) =>
    inv.status === "overdue" ||
    (inv.status === "confirmed" &&
      parseFloat(inv.outstanding) > 0 &&
      new Date(inv.due_date) < new Date(new Date().toDateString()));

  const overdueInvoices = (summary?.recent_invoices ?? []).filter(isOverdue);
  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.outstanding), 0);

  return (
    <div className="space-y-8">
      {/* Overdue Alert Banner */}
      {!loadingSummary && overdueInvoices.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose/30 bg-rose/10 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose/20 text-rose">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-ink">
                You have {overdueInvoices.length} overdue {overdueInvoices.length === 1 ? "invoice" : "invoices"}
              </h2>
              <p className="mt-0.5 text-xs text-ink-2">
                Total overdue balance: <span className="font-semibold text-rose">{formatMoney(totalOverdue.toFixed(2))}</span>. Please settle promptly to avoid service disruption.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {loadingSummary ? (
          <Skeleton className="h-16 w-full" />
        ) : errorSummary || !summary ? (
          <EmptyState
            message="Your portal summary couldn't be loaded."
            action={
              <Button variant="outline" size="sm" onClick={() => refetchSummary()}>
                Try again
              </Button>
            }
          />
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
        ) : errorSubs ? (
          <div className="rounded-xl border border-line bg-surface p-8">
            <EmptyState
              message="Your subscriptions couldn't be loaded."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchSubs()}>
                  Try again
                </Button>
              }
            />
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

        {loadingSummary ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : errorSummary || !summary ? (
          <div className="rounded-xl border border-line bg-surface p-8">
            <EmptyState
              message="Invoices couldn't be loaded."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchSummary()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : summary.recent_invoices.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-2">
            No invoices issued yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="divide-y divide-line text-sm">
              {summary.recent_invoices.map((inv) => {
                const overdue = isOverdue(inv);
                return (
                  <div
                    key={inv.id}
                    className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-canvas text-brand">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link href={`/invoices/${inv.id}/print`} className="tabular-nums font-semibold text-brand hover:underline">
                            {inv.number}
                          </Link>
                          {overdue && (
                            <span className="rounded bg-rose/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose">
                              Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-2">
                          Issued {formatDate(inv.invoice_date)} · Due {formatDate(inv.due_date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="h-8 gap-1.5 text-xs text-ink-2 hover:text-brand hover:border-brand"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Why this bill changed
                      </Button>

                      <StatusBadge domain="invoice" status={overdue ? "overdue" : inv.status} />

                      <div className="text-right">
                        <p className="tabular-nums font-semibold text-ink">
                          {formatMoney(inv.total)}
                        </p>
                        {parseFloat(inv.outstanding) > 0 && inv.status !== "paid" && (
                          <p className={`text-xs font-medium ${overdue ? "text-rose font-bold" : "text-rose"}`}>
                            Due: {formatMoney(inv.outstanding)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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

        {loadingSummary ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : errorSummary || !summary ? (
          <div className="rounded-xl border border-line bg-surface p-8">
            <EmptyState
              message="Payment receipts couldn't be loaded."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchSummary()}>
                  Try again
                </Button>
              }
            />
          </div>
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

      <InvoiceChangesDialog
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
      />
    </div>
  );
}
