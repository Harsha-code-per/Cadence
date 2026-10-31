"use client";
import { ActiveBadge } from "@/components/data/StatusBadge";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import { DateText, Money } from "@/components/data/Money";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import type { components } from "@/lib/api-types";
import { useOptions } from "@/lib/crud";

type Plan = components["schemas"]["Plan"];
type Tax = components["schemas"]["Tax"];

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const columns: ColumnDef<Plan, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "price", header: "Price", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.price} /> },
  {
    id: "cycle",
    header: "Billed",
    cell: ({ row }) => {
      const { billing_period: p, interval_count: n } = row.original;
      return n && n > 1 ? `Every ${n} ${p?.replace("ly", "").replace("dai", "day")}s` : (PERIODS.find((x) => x.value === p)?.label ?? p);
    },
  },
  { accessorKey: "min_quantity", header: "Min qty", meta: { align: "right" } },
  { id: "window", header: "Available", cell: ({ row }) => <><DateText value={row.original.start_date} /> – {row.original.end_date ? <DateText value={row.original.end_date} /> : "open"}</> },
  { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={!!row.original.is_active} /> },
];

export default function PlansPage() {
  const taxes = useOptions<Tax>("taxes");
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "price", label: "Price (₹)", kind: "money", required: true },
      { name: "billing_period", label: "Billing period", kind: "select", required: true, options: PERIODS },
      { name: "interval_count", label: "Every N periods", kind: "number", required: true, hint: "1 = every period, 3 = quarterly on a monthly plan." },
      { name: "min_quantity", label: "Minimum quantity", kind: "number", required: true },
      { name: "start_date", label: "Available from", kind: "date", required: true },
      { name: "end_date", label: "Available until", kind: "date" },
      { name: "tax_ids", label: "Taxes", kind: "multi", options: (taxes.data?.results ?? []).map((t) => ({ value: t.id, label: t.name })) },
      { name: "auto_close", label: "Auto-close when the subscription expires", kind: "checkbox" },
      { name: "closable", label: "Customer can close", kind: "checkbox" },
      { name: "pausable", label: "Customer can pause", kind: "checkbox" },
      { name: "renewable", label: "Customer can renew", kind: "checkbox" },
      { name: "is_active", label: "Active", kind: "checkbox" },
    ],
    [taxes.data],
  );
  return <CatalogPage<Plan> title="Plans" description="Billing cadence, price and rules for subscriptions." resource="plans" noun="Plan" columns={columns} fields={fields} />;
}
