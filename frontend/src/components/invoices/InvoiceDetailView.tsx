"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Printer, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/components/invoices/ActionDialog";
import { RecordPaymentDialog } from "@/components/payments/RecordPaymentDialog";
import { errorMessage } from "@/components/invoices/errors";
import { formatDateTime, paymentMethodLabel, sentence } from "@/components/invoices/format";
import type { InvoiceDetail } from "@/components/invoices/types";
import { useHydrated } from "@/components/invoices/useHydrated";
import { DateText, Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/useMe";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

type InvoiceAction = "confirm" | "cancel" | "send";

const isZeroMoney = (value: string) => /^0+(\.0+)?$/.test(value);

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function AmountRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex items-center justify-between font-semibold" : "flex items-center justify-between"}>
      <dt>{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}

const ACTION_COPY: Record<InvoiceAction, { title: string; confirm: string; pending: string; destructive?: boolean }> = {
  confirm: {
    title: "Confirm this invoice?",
    confirm: "Confirm invoice",
    pending: "Confirming…",
  },
  cancel: {
    title: "Cancel this invoice?",
    confirm: "Cancel invoice",
    pending: "Cancelling…",
    destructive: true,
  },
  send: {
    title: "Send this invoice?",
    confirm: "Send invoice",
    pending: "Sending…",
  },
};

function InvoiceSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

export function InvoiceDetailView({ id }: { id: string }) {
  const client = useQueryClient();
  const { data: me } = useMe();
  const hydrated = useHydrated();
  const [action, setAction] = useState<InvoiceAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}/`),
    retry: (count, cause) =>
      !(cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) && count < 1,
  });

  const act = useMutation({
    mutationFn: (kind: InvoiceAction) => api.post<InvoiceDetail>(`/invoices/${id}/${kind}/`),
    onMutate: () => setActionError(null),
    onSuccess: (updated) => {
      client.setQueryData(["invoice", id], updated);
      void client.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        action === "confirm" ? "Invoice confirmed" : action === "cancel" ? "Invoice cancelled" : "Invoice sent",
      );
      setAction(null);
    },
    onError: (cause) => {
      const message = errorMessage(cause, "The invoice could not be updated.");
      setActionError(message);
      toast.error(message);
    },
  });

  if (invoiceQuery.isLoading) return <InvoiceSkeleton />;

  if (invoiceQuery.isError) {
    const notFound = invoiceQuery.error instanceof ApiError && invoiceQuery.error.status === 404;
    return (
      <>
        <BackLink />
        <div role="alert" className="rounded-lg border bg-surface p-6 text-sm">
          {notFound ? "This invoice does not exist, or you do not have access to it." : "Could not load this invoice."}{" "}
          {!notFound && (
            <Button variant="link" onClick={() => invoiceQuery.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </>
    );
  }

  if (!invoiceQuery.data) return null;
  const invoice = invoiceQuery.data;

  const internal = hydrated && (me?.role === "admin" || me?.role === "staff");
  const canConfirm = internal && invoice.status === "draft";
  const canCancel =
    internal && (invoice.status === "draft" || (invoice.status === "confirmed" && isZeroMoney(invoice.amount_paid)));
  const canSend = internal && (invoice.status === "confirmed" || invoice.status === "paid");
  const canRecordPayment = internal && invoice.status === "confirmed" && !isZeroMoney(invoice.outstanding);
  const payable = invoice.status === "confirmed" || invoice.status === "paid";

  const openAction = (kind: InvoiceAction) => {
    setActionError(null);
    setAction(kind);
  };

  const copy = action ? ACTION_COPY[action] : null;

  return (
    <>
      <BackLink />
      <PageHeader
        title={invoice.number}
        description={`${invoice.customer.company || invoice.customer.name} · ${formatDate(
          invoice.period_start,
        )} – ${formatDate(invoice.period_end)}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={`/invoices/${invoice.id}/print`}
              className={buttonVariants({ variant: "outline" })}
              aria-label={`Print invoice ${invoice.number}`}
            >
              <Printer aria-hidden /> Print
            </Link>
            {internal && (
              <>
                {canSend && (
                  <Button variant="outline" onClick={() => openAction("send")}>
                    <Send aria-hidden /> {invoice.sent_at ? "Resend invoice" : "Send invoice"}
                  </Button>
                )}
                {canRecordPayment && (
                  <Button onClick={() => setPaymentOpen(true)}>Record payment</Button>
                )}
                {canCancel && (
                  <Button variant="outline" onClick={() => openAction("cancel")}>
                    Cancel invoice
                  </Button>
                )}
                {canConfirm && (
                  <Button onClick={() => openAction("confirm")}>
                    <Check aria-hidden /> Confirm invoice
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-lg border bg-surface">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Lines</h2>
              <p className="mt-0.5 text-sm text-ink-2">
                Prices, discounts and taxes are the snapshot stored on this invoice.
              </p>
            </div>
            <div className="divide-y 2xl:hidden">
              {invoice.lines.map((line) => (
                <div key={line.id} className="space-y-3 p-4 text-sm">
                  <div className="break-words font-medium">{line.description}</div>
                  {line.product_name && <div className="break-words text-xs text-ink-3">{line.product_name}</div>}
                  <dl className="grid grid-cols-2 gap-3">
                    <div><dt className="text-xs text-ink-2">Quantity</dt><dd>{line.quantity}</dd></div>
                    <div><dt className="text-xs text-ink-2">Unit price</dt><dd><Money value={line.unit_price} /></dd></div>
                    <div><dt className="text-xs text-ink-2">Amount</dt><dd><Money value={line.amount} /></dd></div>
                    <div><dt className="text-xs text-ink-2">Discount</dt><dd><Money value={line.discount_amount} /></dd></div>
                    <div><dt className="text-xs text-ink-2">Tax</dt><dd><Money value={line.tax_amount} /></dd></div>
                    <div><dt className="text-xs text-ink-2">Total</dt><dd className="font-medium"><Money value={line.total} /></dd></div>
                  </dl>
                  {line.taxes.length > 0 && <ul className="space-y-0.5 text-xs text-ink-3">{line.taxes.map((tax) => <li key={tax.id}>{tax.name.includes("%") ? tax.name : `${tax.name} ${formatPercent(tax.rate)}`} · <Money value={tax.amount} /></li>)}</ul>}
                </div>
              ))}
            </div>
            <div className="hidden 2xl:block"><Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-ink-2">Item</TableHead>
                  <TableHead className="text-right text-ink-2">Qty</TableHead>
                  <TableHead className="text-right text-ink-2">Unit price</TableHead>
                  <TableHead className="text-right text-ink-2">Amount</TableHead>
                  <TableHead className="text-right text-ink-2">Discount</TableHead>
                  <TableHead className="text-right text-ink-2">Tax</TableHead>
                  <TableHead className="text-right text-ink-2">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((line) => (
                  <TableRow key={line.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">{line.description}</div>
                      {line.product_name && <div className="text-xs text-ink-3">{line.product_name}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Money value={line.unit_price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={line.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      {isZeroMoney(line.discount_amount) ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className="tabular-nums">
                          −<Money value={line.discount_amount} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={line.tax_amount} />
                      {line.taxes.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-ink-3">
                          {line.taxes.map((tax) => (
                            <li key={tax.id}>
                              {tax.name.includes("%") ? tax.name : `${tax.name} ${formatPercent(tax.rate)}`} · <Money value={tax.amount} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money value={line.total} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
            <div className="flex justify-end border-t bg-canvas/40 px-4 py-4">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <AmountRow label="Subtotal" value={invoice.subtotal} />
                <AmountRow label="Discount" value={invoice.discount_total} />
                <AmountRow label="Tax" value={invoice.tax_total} />
                <div className="border-t pt-1.5">
                  <AmountRow label="Total" value={invoice.total} strong />
                </div>
                <AmountRow label="Amount paid" value={invoice.amount_paid} />
                {payable && <AmountRow label="Outstanding" value={invoice.outstanding} strong />}
              </dl>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-base font-semibold">Why this bill changed</h2>
            <p className="mt-0.5 text-sm text-ink-2">Compared with the previous invoice for this subscription.</p>
            {invoice.changes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">No differences from the previous invoice.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {invoice.changes.map((change, index) => (
                  <li key={`${change.kind}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div>
                      <div className="mb-0.5">
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                          {sentence(change.kind)}
                        </span>
                      </div>
                      {change.description}
                    </div>
                    <Money value={change.amount_delta} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-lg border bg-surface">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Payments</h2>
              <p className="mt-0.5 text-sm text-ink-2">Payments recorded against this invoice.</p>
            </div>
            {invoice.payments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-2">No payments recorded yet.</p>
            ) : (
              <>
              <div className="divide-y 2xl:hidden">
                {invoice.payments.map((payment) => (
                  <div key={payment.id} className="space-y-2 p-4 text-sm">
                    <p className="break-words font-medium">{payment.number}</p>
                    <dl className="grid grid-cols-2 gap-3">
                      <div><dt className="text-xs text-ink-2">Method</dt><dd>{paymentMethodLabel(payment.method)}</dd></div>
                      <div><dt className="text-xs text-ink-2">Date</dt><dd><DateText value={payment.payment_date} /></dd></div>
                      <div className="min-w-0 break-words"><dt className="text-xs text-ink-2">Reference</dt><dd>{payment.reference || "—"}{payment.note && <p className="text-xs text-ink-3">{payment.note}</p>}</dd></div>
                      <div><dt className="text-xs text-ink-2">Amount</dt><dd><Money value={payment.amount} /></dd></div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="hidden 2xl:block"><Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-ink-2">Payment</TableHead>
                    <TableHead className="text-ink-2">Method</TableHead>
                    <TableHead className="text-ink-2">Date</TableHead>
                    <TableHead className="text-ink-2">Reference</TableHead>
                    <TableHead className="text-right text-ink-2">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.number}</TableCell>
                      <TableCell>{paymentMethodLabel(payment.method)}</TableCell>
                      <TableCell>
                        <DateText value={payment.payment_date} />
                      </TableCell>
                      <TableCell>
                        <div>{payment.reference || "—"}</div>
                        {payment.note && <div className="text-xs text-ink-3">{payment.note}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={payment.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <SummaryRow label="Status">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <StatusBadge domain="invoice" status={invoice.status} />
                  {invoice.is_overdue && <StatusBadge domain="invoice" status="overdue" />}
                </div>
              </SummaryRow>
              <SummaryRow label="Customer">{invoice.customer.company || invoice.customer.name}</SummaryRow>
              <SummaryRow label="Subscription">
                <Link
                  href={`/subscriptions/${invoice.subscription.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {invoice.subscription.number}
                </Link>
              </SummaryRow>
              <SummaryRow label="Invoice date">
                <DateText value={invoice.invoice_date} />
              </SummaryRow>
              <SummaryRow label="Due date">
                <DateText
                  value={invoice.due_date}
                  className={invoice.is_overdue ? "font-medium text-rose" : undefined}
                />
              </SummaryRow>
              <SummaryRow label="Period">
                <DateText value={invoice.period_start} /> – <DateText value={invoice.period_end} />
              </SummaryRow>
              <SummaryRow label="Sent">{invoice.sent_at ? formatDateTime(invoice.sent_at) : "Not sent yet"}</SummaryRow>
            </dl>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <h2 className="text-sm font-semibold">Balance</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {payable ? formatMoney(invoice.outstanding) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {invoice.status === "confirmed"
                ? invoice.is_overdue
                  ? "Overdue — payment is past the due date."
                  : "Still owed on this confirmed invoice."
                : invoice.status === "paid"
                  ? "Paid in full."
                  : invoice.status === "draft"
                    ? "Not payable until the invoice is confirmed."
                    : "Cancelled — no balance is due."}
            </p>
            <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
              <AmountRow label="Total" value={invoice.total} />
              <AmountRow label="Paid" value={invoice.amount_paid} />
            </dl>
          </section>

          <p className="text-xs text-ink-3">
            Status: {sentence(invoice.status)}. Last updated {formatDateTime(invoice.updated_at)}.
          </p>
        </aside>
      </div>

      {action && copy && (
        <ActionDialog
          open={action !== null}
          onOpenChange={(open) => !open && setAction(null)}
          title={action === "send" && invoice.sent_at ? "Resend this invoice?" : copy.title}
          description={
            action === "cancel"
              ? `Cancelling ${invoice.number} releases any discount usage this invoice holds. This cannot be undone.`
              : action === "send"
                ? `Emails ${invoice.customer.name} a summary with a link to the customer portal and records the sent date.`
                : `Confirming makes ${invoice.number} payable. It can still be cancelled until a payment is recorded.`
          }
          confirmLabel={action === "send" && invoice.sent_at ? "Resend invoice" : copy.confirm}
          pendingLabel={copy.pending}
          cancelLabel={action === "confirm" ? "Not now" : action === "send" ? "Don't send" : "Keep invoice"}
          destructive={copy.destructive}
          pending={act.isPending}
          error={actionError}
          onConfirm={() => act.mutate(action)}
        />
      )}

      {canRecordPayment && (
        <RecordPaymentDialog key={invoice.outstanding} open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/invoices"
      className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 transition-colors hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden /> All invoices
    </Link>
  );
}
