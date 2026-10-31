"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { DateText, Money } from "@/components/data/Money";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecordPaymentDialog } from "@/components/payments/RecordPaymentDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUrlState } from "@/hooks/useUrlState";
import { api, type Paginated } from "@/lib/api";

interface PaymentRow {
  id: number;
  number: string;
  invoice: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  method: string;
  amount: string;
  payment_date: string;
  reference: string;
  created_at: string;
}

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  upi: "UPI",
  cheque: "Cheque",
};

function PaymentsContent() {
  const [recordOpen, setRecordOpen] = useState(false);
  const { get, set, page } = useUrlState();

  const search = get("search") ?? "";
  const method = get("method") ?? "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payments", { search, method, page }],
    queryFn: () =>
      api.get<Paginated<PaymentRow>>("/payments/", {
        search,
        method: method || undefined,
        page,
        page_size: 20,
      }),
  });

  const columns: ColumnDef<PaymentRow, unknown>[] = [
    {
      accessorKey: "number",
      header: "Payment #",
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-semibold text-ink">
          {row.original.number}
        </span>
      ),
    },
    {
      accessorKey: "invoice_number",
      header: "Invoice",
      cell: ({ row }) => (
        <Link
          href={`/invoices/${row.original.invoice}`}
          className="tabular-nums text-xs font-medium text-brand hover:underline"
        >
          {row.original.invoice_number}
        </Link>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-ink">{row.original.customer_name}</span>
      ),
    },
    {
      accessorKey: "method",
      header: "Method",
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal capitalize text-ink-2">
          {methodLabels[row.original.method] || row.original.method}
        </Badge>
      ),
    },
    {
      accessorKey: "payment_date",
      header: "Date",
      cell: ({ row }) => (
        <DateText value={row.original.payment_date} className="text-xs text-ink-2" />
      ),
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="text-xs text-ink-3">
          {row.original.reference || "—"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Money
          value={row.original.amount}
          className="tabular-nums text-sm font-semibold text-teal"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Recorded receipts across cash, UPI, cards, and bank transfers."
        actions={
          <Button
            onClick={() => setRecordOpen(true)}
            className="gap-1.5 bg-brand text-white hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
        }
      />

      <FilterBar placeholder="Search payment #, reference, invoice, or customer...">
        <select
          value={method}
          onChange={(e) => set({ method: e.target.value || undefined, page: 1 })}
          className="h-9 rounded-md border border-line bg-canvas px-3 text-sm text-ink focus:border-brand focus:outline-none"
        >
          <option value="">All methods</option>
          <option value="upi">UPI</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="card">Card</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        count={data?.count ?? 0}
        page={page}
        pageSize={20}
        loading={isLoading}
        onPageChange={(p) => set({ page: p })}
        empty={
          isError ? (
            <EmptyState
              message="Payments couldn't be loaded."
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState
              message="No customer payments have been recorded yet or matched the filter."
              action={
                <Button
                  onClick={() => setRecordOpen(true)}
                  className="gap-1.5 bg-brand text-white hover:bg-brand/90"
                >
                  <Plus className="h-4 w-4" />
                  Record payment
                </Button>
              }
            />
          )
        }
      />

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsContent />
    </Suspense>
  );
}
