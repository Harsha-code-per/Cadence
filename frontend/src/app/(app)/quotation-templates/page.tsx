"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { CatalogPage } from "@/components/data/CatalogPage";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { useOptions } from "@/lib/crud";

type Template = components["schemas"]["QuotationTemplate"];
type Plan = components["schemas"]["Plan"];
type Product = components["schemas"]["Product"];
type Term = components["schemas"]["PaymentTerm"];
type Line = { product: number | ""; variant: number | null; quantity: number; description: string };

function LinesEditor({ value, onChange, products }: { value: unknown; onChange: (v: unknown) => void; products: Product[] }) {
  const rows = (value as Line[] | null) ?? [];
  const set = (i: number, patch: Partial<Line>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const variants = products.find((p) => p.id === r.product)?.variants ?? [];
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] gap-2">
            <select aria-label="Product" className="h-9 rounded-md border border-input bg-surface px-2" value={r.product} onChange={(e) => set(i, { product: Number(e.target.value), variant: null })}>
              <option value="" disabled>Product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select aria-label="Variant" className="h-9 rounded-md border border-input bg-surface px-2" value={r.variant ?? ""} onChange={(e) => set(i, { variant: e.target.value ? Number(e.target.value) : null })}>
              <option value="">No variant</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <Input aria-label="Quantity" inputMode="numeric" className="text-right" value={r.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { product: "", variant: null, quantity: 1, description: "" }])}>
        <Plus size={16} /> Add line
      </Button>
    </div>
  );
}

export default function QuotationTemplatesPage() {
  const plans = useOptions<Plan>("plans");
  const products = useOptions<Product>("products", { is_active: true });
  const terms = useOptions<Term>("payment-terms");

  const columns = useMemo<ColumnDef<Template, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { id: "plan", header: "Plan", cell: ({ row }) => plans.data?.results.find((p) => p.id === row.original.plan)?.name ?? "—" },
      { accessorKey: "validity_days", header: "Valid for", meta: { align: "right" }, cell: ({ row }) => `${row.original.validity_days} days` },
      { id: "lines", header: "Lines", meta: { align: "right" }, cell: ({ row }) => row.original.lines.length },
    ],
    [plans.data],
  );
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: "name", label: "Name", kind: "text", required: true, wide: true },
      { name: "plan", label: "Plan", kind: "select", required: true, options: (plans.data?.results ?? []).map((p) => ({ value: p.id, label: p.name })) },
      { name: "payment_term", label: "Payment term", kind: "select", options: (terms.data?.results ?? []).map((t) => ({ value: t.id, label: t.name })) },
      { name: "validity_days", label: "Quote valid for (days)", kind: "number", required: true },
      { name: "lines", label: "Products", kind: "custom", render: (v, c) => <LinesEditor value={v} onChange={c} products={products.data?.results ?? []} /> },
      { name: "notes", label: "Notes", kind: "textarea" },
    ],
    [plans.data, terms.data, products.data],
  );
  return <CatalogPage<Template> title="Quotation templates" description="Reusable starting points for quotations." resource="quotation-templates" noun="Template" columns={columns} fields={fields} />;
}
