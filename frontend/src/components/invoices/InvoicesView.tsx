"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { DateText, Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { RunBillingDialog } from "@/components/invoices/RunBillingDialog";
import { formatDateTime, sentence } from "@/components/invoices/format";
import type { CustomerOption, Invoice, LastBillingRun } from "@/components/invoices/types";
import { useHydrated } from "@/components/invoices/useHydrated";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/useMe";
import { useUrlState } from "@/hooks/useUrlState";
import { api, qs, type Paginated } from "@/lib/api";

const STATUSES = ["draft", "confirmed", "paid", "cancelled"] as const;

const columns: ColumnDef<Invoice, unknown>[] = [
  {
    header: "Invoice",
    cell: ({ row }) => (
      <Link
        href={`/invoices/${row.original.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.number}
      </Link>
    ),
  },
  {
    header: "Customer",
    cell: ({ row }) => {
      const { name, company } = row.original.customer;
      return (
        <div className="leading-tight">
          <div>{company || name}</div>
          {company && company !== name && <div className="text-xs text-ink-3">{name}</div>}
        </div>
      );
    },
  },
  {
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge domain="invoice" status={row.original.status} />
        {row.original.is_overdue && <StatusBadge domain="invoice" status="overdue" />}
      </div>
    ),
  },
  { header: "Invoice date", cell: ({ row }) => <DateText value={row.original.invoice_date} /> },
  {
    header: "Due",
    cell: ({ row }) => (
      <DateText
        value={row.original.due_date}
        className={row.original.is_overdue ? "font-medium text-rose" : undefined}
      />
    ),
  },
  { header: "Total", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.total} /> },
  {
    header: "Outstanding",
    meta: { align: "right" },
    cell: ({ row }) =>
      row.original.status === "confirmed" || row.original.status === "paid" ? (
        <Money
          value={row.original.outstanding}
          className={row.original.is_overdue ? "font-medium text-rose" : undefined}
        />
      ) : (
        <span className="text-ink-3">—</span>
      ),
  },
];

export function InvoicesView() {
  const router = useRouter();
  const url = useUrlState();
  const { data: me } = useMe();
  const hydrated = useHydrated();
  const [billingOpen, setBillingOpen] = useState(false);

  const page = url.page;
  const search = url.get("search");
  const status = url.get("status");
  const customer = url.get("customer");
  const overdue = url.get("overdue") === "true";
  const from = url.get("from");
  const to = url.get("to");

  const internal = hydrated && (me?.role === "admin" || me?.role === "staff");
  const isAdmin = hydrated && me?.role === "admin";
  const rangeInvalid = Boolean(from && to && from > to);

  const invoices = useQuery({
    queryKey: ["invoices", { page, search, status, customer, overdue, from, to }],
    queryFn: () =>
      api.get<Paginated<Invoice>>("/invoices/", {
        page,
        search: search || undefined,
        status: status || undefined,
        customer: customer || undefined,
        overdue: overdue ? "true" : undefined,
        invoice_date__gte: rangeInvalid ? undefined : from || undefined,
        invoice_date__lte: rangeInvalid ? undefined : to || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const customers = useQuery({
    queryKey: ["invoice-customers"],
    queryFn: () => api.get<Paginated<CustomerOption>>("/customers/", { page_size: 100 }),
    enabled: internal,
    retry: false,
    staleTime: 5 * 60_000,
  });

  // The last-run strip comes from the manual billing-controls PR (GET /api/billing/last-run/).
  const lastRun = useQuery({
    queryKey: ["billing-last-run"],
    queryFn: () => api.get<LastBillingRun>("/billing/last-run/"),
    enabled: internal,
    retry: false,
    staleTime: 30_000,
  });

  const activeFilters = Boolean(status || customer || overdue || from || to);
  const last = lastRun.data?.last_run;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every bill in one place: drafts, confirmed invoices, what has been paid and what is still owed."
        actions={
          internal ? (
            <>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={`/api/invoices/export/${qs({
                  search,
                  status,
                  customer,
                  overdue: overdue ? "true" : undefined,
                  invoice_date__gte: rangeInvalid ? undefined : from,
                  invoice_date__lte: rangeInvalid ? undefined : to,
                })}`}
              >
                <Download aria-hidden /> Export CSV
              </a>
              {isAdmin && (
                <Button onClick={() => setBillingOpen(true)}>
                  <Play aria-hidden /> Run billing now
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {internal && last && (
        <div className="mb-4 rounded-lg border bg-surface px-4 py-3 text-sm text-ink-2">
          Last billing run {formatDateTime(last.ran_at)} · {last.invoiced} invoiced · {last.skipped} skipped · {sentence(last.triggered_by)}
        </div>
      )}

      <FilterBar placeholder="Search invoice number or customer">
        <select
          aria-label="Filter by status"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          value={status}
          onChange={(event) => url.set({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {sentence(value)}
            </option>
          ))}
        </select>

        {internal && (
          <select
            aria-label="Filter by customer"
            className="h-8 max-w-56 rounded-lg border border-input bg-background px-2.5 text-sm"
            value={customer}
            disabled={customers.isLoading || customers.isError}
            onChange={(event) => url.set({ customer: event.target.value })}
          >
            <option value="">
              {customers.isLoading
                ? "Loading customers…"
                : customers.isError
                  ? "Customer list unavailable"
                  : "All customers"}
            </option>
            {customer && !customers.data?.results.some((item) => String(item.id) === customer) && (
              <option value={customer}>Customer #{customer}</option>
            )}
            {customers.data?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.company || item.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          From
          <Input
            type="date"
            aria-label="Invoice date from"
            className="w-36"
            value={from}
            max={to || undefined}
            onChange={(event) => url.set({ from: event.target.value })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          To
          <Input
            type="date"
            aria-label="Invoice date to"
            className="w-36"
            value={to}
            min={from || undefined}
            onChange={(event) => url.set({ to: event.target.value })}
          />
        </label>

        <Button
          variant={overdue ? "default" : "outline"}
          size="sm"
          aria-pressed={overdue}
          onClick={() => url.set({ overdue: overdue ? "" : "true" })}
        >
          Overdue only
        </Button>

        {activeFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => url.set({ status: "", customer: "", overdue: "", from: "", to: "" })}
          >
            Clear filters
          </Button>
        )}
      </FilterBar>

      {rangeInvalid && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          The from date must be on or before the to date. Date filters are paused until the range is valid.
        </p>
      )}

      {invoices.isError ? (
        <div role="alert" className="rounded-lg border bg-surface p-6 text-sm">
          Could not load invoices.{" "}
          <Button variant="link" onClick={() => invoices.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={invoices.data?.results ?? []}
          count={invoices.data?.count ?? 0}
          page={page}
          loading={invoices.isLoading}
          onPageChange={(next) => url.set({ page: next === 1 ? "" : next })}
          onRowClick={(invoice) => router.push(`/invoices/${invoice.id}`)}
          empty={
            <EmptyState
              message={
                search || activeFilters
                  ? "No invoices match these filters."
                  : "No invoices yet. They appear here after a billing run bills a due subscription."
              }
            />
          }
        />
      )}

      <RunBillingDialog key={billingOpen ? "open" : "closed"} open={billingOpen} onOpenChange={setBillingOpen} />
    </>
  );
}
