"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import type { components } from "@/lib/api-types";

type Tax = components["schemas"]["Tax"];
type Term = components["schemas"]["PaymentTerm"];

const taxColumns: ColumnDef<Tax, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "rate", header: "Rate", meta: { align: "right" }, cell: ({ row }) => formatPercent(row.original.rate) },
  { accessorKey: "is_active", header: "Status", cell: ({ row }) => (row.original.is_active ? "Active" : "Inactive") },
];
const taxFields: FieldDef[] = [
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "rate", label: "Rate (%)", kind: "money", required: true, hint: "For example 18 for 18% GST." },
  { name: "is_active", label: "Active", kind: "checkbox" },
];

const termColumns: ColumnDef<Term, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "due_days", header: "Due after", meta: { align: "right" }, cell: ({ row }) => `${row.original.due_days} days` },
];
const termFields: FieldDef[] = [
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "due_days", label: "Due after (days)", kind: "number", required: true },
];

export default function TaxesPage() {
  const [tab, setTab] = useState<"taxes" | "terms">("taxes");
  const switcher = (
    <div className="mb-4 inline-flex rounded-md border bg-surface p-0.5" role="tablist" aria-label="Taxes and payment terms">
      {(["taxes", "terms"] as const).map((t) => (
        <Button key={t} role="tab" aria-selected={tab === t} size="sm" variant={tab === t ? "secondary" : "ghost"} onClick={() => setTab(t)}>
          {t === "taxes" ? "Taxes" : "Payment terms"}
        </Button>
      ))}
    </div>
  );
  return (
    <>
      {switcher}
      {tab === "taxes" ? (
        <CatalogPage<Tax> key="taxes" title="Taxes" description="Rates applied to invoice lines." resource="taxes" noun="Tax" columns={taxColumns} fields={taxFields} />
      ) : (
        <CatalogPage<Term> key="terms" title="Payment terms" description="When an invoice falls due." resource="payment-terms" noun="Payment term" columns={termColumns} fields={termFields} />
      )}
    </>
  );
}
