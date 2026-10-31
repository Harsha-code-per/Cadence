"use client";
import { ActiveBadge } from "@/components/data/StatusBadge";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import { SegmentedTabs } from "@/components/data/SegmentedTabs";
import { formatPercent } from "@/lib/format";
import type { components } from "@/lib/api-types";

type Tax = components["schemas"]["Tax"];
type Term = components["schemas"]["PaymentTerm"];

const taxColumns: ColumnDef<Tax, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "rate", header: "Rate", meta: { align: "right" }, cell: ({ row }) => formatPercent(row.original.rate) },
  { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={!!row.original.is_active} /> },
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
    <SegmentedTabs
      label="Taxes and payment terms"
      value={tab}
      onChange={setTab}
      options={[
        { value: "taxes", label: "Taxes" },
        { value: "terms", label: "Payment terms" },
      ]}
    />
  );
  return (
    <>
      {tab === "taxes" ? (
        <CatalogPage<Tax> key="taxes" title="Taxes" description="Rates applied to invoice lines." resource="taxes" noun="Tax" columns={taxColumns} fields={taxFields} belowHeader={switcher} />
      ) : (
        <CatalogPage<Term> key="terms" title="Payment terms" description="When an invoice falls due." resource="payment-terms" noun="Payment term" columns={termColumns} fields={termFields} belowHeader={switcher} />
      )}
    </>
  );
}
