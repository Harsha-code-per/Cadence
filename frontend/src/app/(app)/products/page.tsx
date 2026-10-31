"use client";
import { ActiveBadge } from "@/components/data/StatusBadge";
import type { ColumnDef } from "@tanstack/react-table";
import { Layers, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import { Money } from "@/components/data/Money";
import { VariantsDialog } from "@/components/data/VariantsDialog";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/useMe";
import type { components } from "@/lib/api-types";
import { useOptions } from "@/lib/crud";

type Product = components["schemas"]["Product"];
type Attribute = components["schemas"]["Attribute"];
type Tax = components["schemas"]["Tax"];
type Value = { id?: number; name: string; extra_price?: string };

const TYPES = [
  { value: "service", label: "Service" },
  { value: "goods", label: "Goods" },
  { value: "addon", label: "Add-on" },
];

const attributeColumns: ColumnDef<Attribute, unknown>[] = [
  { accessorKey: "name", header: "Attribute" },
  {
    id: "values",
    header: "Values",
    cell: ({ row }) => row.original.values.map((v) => (Number(v.extra_price) ? `${v.name} (+₹${Number(v.extra_price)})` : v.name)).join(", "),
  },
];

function ValuesEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const rows = (value as Value[] | null) ?? [];
  const set = (i: number, patch: Partial<Value>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label="Value name" placeholder="Odoo" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Input aria-label="Extra price" placeholder="0.00" inputMode="decimal" className="w-32 text-right" value={r.extra_price ?? ""} onChange={(e) => set(i, { extra_price: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove value" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { name: "", extra_price: "0.00" }])}>
        <Plus size={16} /> Add value
      </Button>
    </div>
  );
}

const attributeFields: FieldDef[] = [
  { name: "name", label: "Name", kind: "text", required: true, hint: "For example Brand." },
  { name: "values", label: "Values and extra price", kind: "custom", render: (v, c) => <ValuesEditor value={v} onChange={c} /> },
];

export default function ProductsPage() {
  const [tab, setTab] = useState<"products" | "attributes">("products");
  const [variantsOf, setVariantsOf] = useState<Product | null>(null);
  const { data: me } = useMe();
  const taxes = useOptions<Tax>("taxes");

  const columns = useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "product_type", header: "Type", cell: ({ row }) => TYPES.find((t) => t.value === row.original.product_type)?.label },
      { accessorKey: "sales_price", header: "Sales price", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.sales_price} /> },
      { accessorKey: "cost_price", header: "Cost", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.cost_price} /> },
      { id: "variants", header: "Variants", meta: { align: "right" }, cell: ({ row }) => row.original.variants.length },
      { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={!!row.original.is_active} /> },
    ],
    [],
  );
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: "name", label: "Name", kind: "text", required: true, wide: true },
      { name: "product_type", label: "Type", kind: "select", required: true, options: TYPES },
      { name: "is_active", label: "Active", kind: "checkbox" },
      { name: "sales_price", label: "Sales price (₹)", kind: "money", required: true },
      { name: "cost_price", label: "Cost price (₹)", kind: "money", required: true },
      { name: "tax_ids", label: "Taxes", kind: "multi", options: (taxes.data?.results ?? []).map((t) => ({ value: t.id, label: t.name })) },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
    [taxes.data],
  );

  const switcher = (
    <div className="mb-4 inline-flex rounded-md border bg-surface p-0.5" role="tablist" aria-label="Products and attributes">
      {(["products", "attributes"] as const).map((t) => (
        <Button key={t} role="tab" aria-selected={tab === t} size="sm" variant={tab === t ? "secondary" : "ghost"} onClick={() => setTab(t)}>
          {t === "products" ? "Products" : "Attributes"}
        </Button>
      ))}
    </div>
  );

  return (
    <>
      {switcher}
      {tab === "products" ? (
        <CatalogPage<Product>
          key="products"
          title="Products"
          description="What you sell. Variants add to the base price."
          resource="products"
          noun="Product"
          columns={columns}
          fields={fields}
          rowActions={(p) => (
            <Button variant="ghost" size="icon" aria-label={`Variants of ${p.name}`} onClick={() => setVariantsOf(p)}>
              <Layers size={16} />
            </Button>
          )}
        />
      ) : (
        <CatalogPage<Attribute>
          key="attributes"
          title="Attributes"
          description="Options such as Brand that create product variants."
          resource="attributes"
          noun="Attribute"
          columns={attributeColumns}
          fields={attributeFields}
        />
      )}
      <VariantsDialog product={variantsOf} canWrite={me?.role === "admin"} onClose={() => setVariantsOf(null)} />
    </>
  );
}
