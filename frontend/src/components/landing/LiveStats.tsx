"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

type Stats = { active_subscriptions: number; invoices_issued: number; revenue_collected: string };

/** Real numbers from GET /api/public/stats/. While loading or if the API is down it shows dashes, never made-up figures. */
export function LiveStats() {
  const { data } = useQuery({ queryKey: ["public-stats"], queryFn: () => api.get<Stats>("/public/stats/"), retry: 1 });
  const items = [
    { value: data ? data.active_subscriptions.toLocaleString("en-IN") : "—", label: "active subscriptions right now" },
    { value: data ? data.invoices_issued.toLocaleString("en-IN") : "—", label: "invoices issued" },
    { value: data ? formatMoney(data.revenue_collected).replace(/\.00$/, "") : "—", label: "collected, live from the demo database" },
  ];
  return (
    <dl className="grid gap-6 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-2">
          <dd className="order-1 font-display text-5xl font-bold tracking-[-0.03em] text-marigold tabular-nums md:text-6xl">{i.value}</dd>
          <dt className="order-2 text-base text-sidebar-foreground">{i.label}</dt>
        </div>
      ))}
    </dl>
  );
}
