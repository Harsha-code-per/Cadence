"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";

type Addon = components["schemas"]["Addon"];

export function SubscriptionAddons({ subscriptionId }: { subscriptionId: number }) {
  const client = useQueryClient();
  const key = ["subscription-addons", subscriptionId];
  const path = `/subscriptions/${subscriptionId}/addons/`;
  const addons = useQuery({ queryKey: key, queryFn: () => api.get<Addon[]>(path) });
  const change = useMutation({
    mutationFn: (addon: Addon) => addon.on
      ? api.delete(`${path}${addon.id}/`)
      : api.post<void>(path, { product: addon.id }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ["portal-subscriptions"] }),
      ]);
      toast.success("Add-on updated for future invoices.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update the add-on."),
  });

  return (
    <section className="mt-4 space-y-2 border-t border-line pt-3" aria-label="Add-ons">
      <h4 className="text-sm font-semibold text-ink">Add-ons</h4>
      <p className="text-xs text-ink-2">Changes apply to future invoices.</p>
      {addons.isLoading && <p className="text-sm text-ink-2">Loading add-ons…</p>}
      {addons.isError && <p className="text-sm text-rose">Could not load add-ons. <button type="button" className="underline" onClick={() => addons.refetch()}>Try again</button></p>}
      {addons.data?.length === 0 && <p className="text-sm text-ink-2">No add-ons available.</p>}
      {addons.data?.map((addon) => (
        <div key={addon.id} className="flex items-center justify-between gap-3 text-sm">
          <div><p className="font-medium text-ink">{addon.name}</p><p className="text-ink-2">{formatMoney(addon.sales_price)} per billing period</p></div>
          <Button size="sm" variant="outline" disabled={change.isPending} aria-label={`${addon.on ? "Turn off" : "Turn on"} ${addon.name}`} onClick={() => change.mutate(addon)}>
            {addon.on ? "Turn off" : "Turn on"}
          </Button>
        </div>
      ))}
    </section>
  );
}
