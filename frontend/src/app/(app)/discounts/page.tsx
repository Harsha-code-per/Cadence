"use client";
import { ActiveBadge } from "@/components/data/StatusBadge";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import { DateText } from "@/components/data/Money";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import type { components } from "@/lib/api-types";
import { useOptions } from "@/lib/crud";
import { formatMoney, formatPercent } from "@/lib/format";

type Discount = components["schemas"]["Discount"];
type Product = components["schemas"]["Product"];

const columns: ColumnDef<Discount, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "code", header: "Code", cell: ({ row }) => row.original.code || "—" },
  {
    accessorKey: "value",
    header: "Value",
    meta: { align: "right" },
    cell: ({ row }) => (row.original.discount_type === "percent" ? formatPercent(row.original.value ?? 0) : formatMoney(row.original.value)),
  },
  { accessorKey: "scope", header: "Applies to", cell: ({ row }) => (row.original.scope === "product" ? "Products" : "Subscription") },
  { id: "window", header: "Valid", cell: ({ row }) => <><DateText value={row.original.start_date} /> – {row.original.end_date ? <DateText value={row.original.end_date} /> : "open"}</> },
  {
    id: "usage",
    header: "Used",
    meta: { align: "right" },
    cell: ({ row }) => `${row.original.times_used}${row.original.usage_limit ? ` / ${row.original.usage_limit}` : ""}`,
  },
  { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={!!row.original.is_active} /> },
];

export default function DiscountsPage() {
  const products = useOptions<Product>("products");
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "code", label: "Code", kind: "text", hint: "Leave empty to apply on its own to every subscription that qualifies. With a code, staff attach it to a draft." },
      { name: "discount_type", label: "Type", kind: "select", required: true, options: [{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount" }] },
      { name: "value", label: "Value", kind: "money", required: true, hint: "Percent or rupees, depending on the type." },
      { name: "scope", label: "Applies to", kind: "select", required: true, options: [{ value: "subscription", label: "Whole subscription" }, { value: "product", label: "Selected products" }] },
      { name: "min_amount", label: "Minimum amount (₹)", kind: "money" },
      { name: "min_quantity", label: "Minimum quantity", kind: "number" },
      { name: "start_date", label: "Starts", kind: "date", required: true },
      { name: "end_date", label: "Ends", kind: "date" },
      { name: "usage_limit", label: "Usage limit", kind: "number", hint: "Leave empty for unlimited." },
      { name: "product_ids", label: "Products (when scoped to products)", kind: "multi", options: (products.data?.results ?? []).map((p) => ({ value: p.id, label: p.name })) },
      { name: "is_active", label: "Active", kind: "checkbox" },
    ],
    [products.data],
  );
  return <CatalogPage<Discount> title="Discounts" description="Fixed or percentage, with limits. Applied automatically at billing." resource="discounts" noun="Discount" columns={columns} fields={fields} />;
}
