"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Money } from "@/components/data/Money";
import { ResourceDialog, type FieldDef } from "@/components/forms/ResourceDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { components } from "@/lib/api-types";
import { useList, useOptions, useRemove, useSave } from "@/lib/crud";
import { formatMoney } from "@/lib/format";

type Variant = components["schemas"]["Variant"];
type Attribute = components["schemas"]["Attribute"];

/** Variants of one product. The price shown is computed by the API (base price + attribute extras). */
export function VariantsDialog({
  product,
  canWrite,
  onClose,
}: {
  product: { id: number; name: string } | null;
  canWrite: boolean;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const variants = useList<Variant>("variants", { product: product?.id, page_size: 100 });
  const attributes = useOptions<Attribute>("attributes");
  const save = useSave<Variant>("variants", "Variant");
  const remove = useRemove("variants", "Variant");

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: "value_ids",
        label: "Attribute values",
        kind: "multi",
        options: (attributes.data?.results ?? []).flatMap((a) =>
          a.values.map((v) => ({
            value: v.id as number,
            label: `${a.name}: ${v.name}${Number(v.extra_price) ? ` (+${formatMoney(v.extra_price)})` : ""}`,
          })),
        ),
      },
      { name: "sku", label: "SKU", kind: "text" },
    ],
    [attributes.data],
  );

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Variants of {product?.name}</DialogTitle>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {variants.data?.results.length === 0 && <li className="p-4 text-sm text-ink-2">No variants yet. The base price applies.</li>}
          {variants.data?.results.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {v.label} {v.sku && <span className="text-ink-3">· {v.sku}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Money value={v.price} />
                {canWrite && (
                  <Button variant="ghost" size="icon" aria-label={`Delete variant ${v.label}`} onClick={() => remove.mutate(v.id)}>
                    <Trash2 size={16} />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {canWrite && (
          <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add variant
          </Button>
        )}
        <ResourceDialog
          open={adding}
          onOpenChange={setAdding}
          title="New variant"
          fields={fields}
          submitLabel="Create variant"
          onSubmit={(body) => save.mutateAsync({ body: { ...body, product: product?.id } })}
        />
      </DialogContent>
    </Dialog>
  );
}
