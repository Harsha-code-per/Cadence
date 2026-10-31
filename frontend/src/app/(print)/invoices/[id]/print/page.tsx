"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { DateText, Money } from "@/components/data/Money";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/api";

type Invoice = {
  number: string;
  status: string;
  customer: { name: string; company: string };
  subscription: { number: string };
  invoice_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  outstanding: string;
  lines: {
    id: number;
    description: string;
    quantity: number;
    unit_price: string;
    discount_amount: string;
    total: string;
    taxes: { id: number; name: string; rate: string; amount: string }[];
  }[];
};

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-8 py-1 ${strong ? "border-t border-slate-400 pt-3 font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useQuery({ queryKey: ["invoice", id], queryFn: () => api.get<Invoice>(`/invoices/${id}/`) });
  const customer = useMe().data?.role === "customer";
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink print:min-h-0 print:bg-white print:p-0">
      <style>{`@media print { @page { size: auto; margin: 16mm; } body { background: white !important; color: black !important; } .print-document { box-shadow: none !important; border: 0 !important; padding: 0 !important; } thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-4xl justify-between gap-3 print:hidden">
        <Link
          href={customer ? "/portal" : `/invoices/${id}`}
          className="inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft size={16} /> {customer ? "Back to portal" : "Back to invoice"}
        </Link>
        <Button disabled={!invoice.data} onClick={() => window.print()}>
          <Printer /> Print invoice
        </Button>
      </div>
      {invoice.isLoading ? (
        <p role="status" className="mx-auto max-w-4xl">
          Loading invoice…
        </p>
      ) : invoice.isError || !invoice.data ? (
        <div role="alert" className="mx-auto max-w-4xl rounded border bg-white p-6">
          <p>Could not load this invoice.</p>
          <Button variant="outline" className="mt-3" onClick={() => invoice.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <article className="print-document mx-auto max-w-4xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <header className="flex flex-wrap justify-between gap-6 border-b border-slate-300 pb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">Brightloop Software</p>
              <h1 className="mt-2 text-3xl font-semibold">Invoice</h1>
              <p className="mt-1 text-sm">{invoice.data.number}</p>
            </div>
            <div className="text-sm sm:text-right">
              <p className="font-semibold uppercase">{invoice.data.status}</p>
              <p className="mt-2">
                Invoice date: <DateText value={invoice.data.invoice_date} />
              </p>
              <p>
                Due date: <DateText value={invoice.data.due_date} />
              </p>
            </div>
          </header>
          <section className="grid gap-6 py-6 text-sm sm:grid-cols-2" aria-label="Invoice details">
            <div>
              <h2 className="font-semibold text-slate-600">Bill to</h2>
              <p className="mt-2 font-semibold">{invoice.data.customer.name}</p>
              {invoice.data.customer.company && <p>{invoice.data.customer.company}</p>}
            </div>
            <div>
              <h2 className="font-semibold text-slate-600">Subscription</h2>
              <p className="mt-2">{invoice.data.subscription.number}</p>
              <p>
                Period: <DateText value={invoice.data.period_start} /> – <DateText value={invoice.data.period_end} />
              </p>
            </div>
          </section>
          <div className="divide-y divide-slate-200 sm:hidden print:hidden">
            {invoice.data.lines.map((line) => (
              <div key={line.id} className="space-y-2 py-3 text-sm">
                <p className="break-words font-medium">{line.description}</p>
                {line.taxes.map((tax) => <p key={tax.id} className="text-xs text-slate-600">{tax.name.includes("%") ? tax.name : `${tax.name} (${tax.rate}%)`}: <Money value={tax.amount} /></p>)}
                <dl className="grid grid-cols-2 gap-2">
                  <div><dt className="text-xs text-slate-600">Qty</dt><dd>{line.quantity}</dd></div>
                  <div><dt className="text-xs text-slate-600">Unit price</dt><dd><Money value={line.unit_price} /></dd></div>
                  <div><dt className="text-xs text-slate-600">Discount</dt><dd><Money value={line.discount_amount} /></dd></div>
                  <div><dt className="text-xs text-slate-600">Total</dt><dd><Money value={line.total} /></dd></div>
                </dl>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block print:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-slate-300">
                  <th className="py-3 pr-3 font-semibold">Description</th>
                  <th className="px-2 text-right font-semibold">Qty</th>
                  <th className="px-2 text-right font-semibold">Unit price</th>
                  <th className="px-2 text-right font-semibold">Discount</th>
                  <th className="pl-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.data.lines.map((line) => (
                  <tr key={line.id} className="border-b border-slate-200 align-top">
                    <td className="py-3 pr-3">
                      <p>{line.description}</p>
                      {line.taxes.map((tax) => (
                        <p key={tax.id} className="mt-1 text-xs text-slate-600">
                          {tax.name.includes("%") ? tax.name : `${tax.name} (${tax.rate}%)`}: <Money value={tax.amount} />
                        </p>
                      ))}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <Money value={line.unit_price} />
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <Money value={line.discount_amount} />
                    </td>
                    <td className="py-3 pl-2 text-right whitespace-nowrap">
                      <Money value={line.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invoice.data.lines.length === 0 && <p className="py-4 text-sm text-slate-600">No invoice lines.</p>}
          <dl className="ml-auto mt-6 w-full max-w-xs text-sm">
            <AmountRow label="Subtotal" value={invoice.data.subtotal} />
            <AmountRow label="Discount" value={invoice.data.discount_total} />
            <AmountRow label="Tax" value={invoice.data.tax_total} />
            <AmountRow label="Total" value={invoice.data.total} strong />
            <AmountRow label="Amount paid" value={invoice.data.amount_paid} />
            {["confirmed", "paid"].includes(invoice.data.status) && (
              <AmountRow label="Outstanding" value={invoice.data.outstanding} />
            )}
          </dl>
        </article>
      )}
    </main>
  );
}
