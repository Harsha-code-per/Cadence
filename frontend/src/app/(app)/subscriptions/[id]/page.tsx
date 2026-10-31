"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateText, Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type Paginated } from "@/lib/api";

type Subscription = {
  id: number;
  number: string;
  status: string;
  customer: { name: string; company: string };
  plan: { name: string; billing_period: string; interval_count: number };
  start_date: string;
  expiration_date: string | null;
  next_invoice_date: string | null;
  valid_until: string | null;
  payment_term: { name: string };
  discount: { name: string } | null;
  recurring_total: string;
  notes: string;
  close_reason: string;
  allowed_actions: string[];
  lines: {
    id: number;
    product_name: string;
    variant_label: string | null;
    description: string;
    quantity: number;
    unit_price: string;
    amount: string;
  }[];
};
type Event = {
  id: number;
  from_status: string;
  to_status: string;
  note: string;
  actor: { full_name: string } | null;
  created_at: string;
};

const ACTIONS: Record<string, { label: string; description: string }> = {
  send: { label: "Send quotation", description: "Move this draft to quotation." },
  revise: { label: "Revise", description: "Return this quotation to draft for changes." },
  confirm: { label: "Confirm", description: "Confirm this quotation." },
  activate: { label: "Activate", description: "Activate the subscription and create its first invoice." },
  pause: { label: "Pause", description: "Pause recurring billing for this subscription." },
  resume: { label: "Resume", description: "Resume this subscription." },
  close: { label: "Close", description: "Close this subscription." },
  renew: { label: "Renew", description: "Create a new quotation from this subscription." },
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const subscription = useQuery({
    queryKey: ["subscription", id],
    queryFn: () => api.get<Subscription>(`/subscriptions/${id}/`),
  });
  const events = useQuery({
    queryKey: ["subscription-events", id, page],
    queryFn: () => api.get<Paginated<Event>>(`/subscriptions/${id}/events/`, { page }),
    enabled: !!subscription.data,
  });
  const action = useMutation({
    mutationFn: (name: string) => api.post<Subscription>(`/subscriptions/${id}/${name}/`, { note: note.trim() }),
    onSuccess: async (result, name) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["subscription", id] }),
        client.invalidateQueries({ queryKey: ["subscription-events", id] }),
        client.invalidateQueries({ queryKey: ["subscriptions"] }),
      ]);
      setSelectedAction(null);
      setNote("");
      if (name === "renew" && String(result.id) !== id) router.push(`/subscriptions/${result.id}`);
    },
  });
  if (subscription.isLoading)
    return (
      <p role="status" className="text-ink-2">
        Loading subscription…
      </p>
    );
  if (subscription.isError || !subscription.data)
    return (
      <div role="alert">
        <p>Could not load this subscription.</p>
        <Button variant="link" onClick={() => subscription.refetch()}>
          Try again
        </Button>
        <Link href="/subscriptions" className="ml-2 text-primary underline">
          Back to subscriptions
        </Link>
      </div>
    );
  const sub = subscription.data;
  const available = sub.allowed_actions.filter((name) => Object.hasOwn(ACTIONS, name));
  return (
    <>
      <Link href="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft size={16} /> Subscriptions
      </Link>
      <PageHeader
        title={sub.number}
        description={`${sub.customer.name}${sub.customer.company ? ` · ${sub.customer.company}` : ""}`}
        actions={<StatusBadge domain="subscription" status={sub.status} />}
      />
      {available.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Subscription actions">
          {available.map((name) => (
            <Button
              key={name}
              variant={name === "close" ? "destructive" : "outline"}
              disabled={action.isPending}
              onClick={() => {
                action.reset();
                setNote("");
                setSelectedAction(name);
              }}
            >
              {ACTIONS[name].label}
            </Button>
          ))}
        </div>
      )}
      {selectedAction && (
        <section aria-labelledby="action-heading" className="mb-6 rounded-lg border bg-surface p-5">
          <h2 id="action-heading" className="font-semibold">
            {ACTIONS[selectedAction].label}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{ACTIONS[selectedAction].description}</p>
          <label className="mt-4 grid max-w-xl gap-1.5 text-sm font-medium">
            Note (optional)
            <Textarea maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {action.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {action.error.message}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              variant={selectedAction === "close" ? "destructive" : "default"}
              disabled={action.isPending}
              onClick={() => action.mutate(selectedAction)}
            >
              {action.isPending ? "Working…" : `Confirm ${ACTIONS[selectedAction].label.toLowerCase()}`}
            </Button>
            <Button variant="outline" disabled={action.isPending} onClick={() => setSelectedAction(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      <section aria-labelledby="overview-heading" className="mb-6 rounded-lg border bg-surface p-5">
        <h2 id="overview-heading" className="mb-4 text-lg font-semibold">
          Overview
        </h2>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Plan">{sub.plan.name}</Detail>
          <Detail label="Payment term">{sub.payment_term.name}</Detail>
          <Detail label="Start date">
            <DateText value={sub.start_date} />
          </Detail>
          <Detail label="End date">
            <DateText value={sub.expiration_date} />
          </Detail>
          <Detail label="Next invoice">
            <DateText value={sub.next_invoice_date} />
          </Detail>
          <Detail label="Quotation valid until">
            <DateText value={sub.valid_until} />
          </Detail>
          <Detail label="Discount">{sub.discount?.name ?? "—"}</Detail>
          <Detail label="Recurring amount">
            <Money value={sub.recurring_total} />
          </Detail>
        </dl>
        {sub.notes && <p className="mt-5 whitespace-pre-wrap text-sm text-ink-2">{sub.notes}</p>}
        {sub.close_reason && <p className="mt-3 text-sm text-ink-2">Close reason: {sub.close_reason}</p>}
      </section>
      <section aria-labelledby="lines-heading" className="mb-6 overflow-hidden rounded-lg border bg-surface">
        <h2 id="lines-heading" className="px-5 pt-5 text-lg font-semibold">
          Subscription lines
        </h2>
        {sub.lines.length === 0 ? (
          <p className="p-5 text-sm text-ink-2">No lines have been added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-2">
                <tr>
                  <th className="p-4 font-medium">Product</th>
                  <th className="p-4 text-right font-medium">Quantity</th>
                  <th className="p-4 text-right font-medium">Unit price</th>
                  <th className="p-4 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sub.lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="p-4">
                      {line.description || line.product_name}
                      {line.variant_label && <span className="block text-xs text-ink-2">{line.variant_label}</span>}
                    </td>
                    <td className="p-4 text-right tabular-nums">{line.quantity}</td>
                    <td className="p-4 text-right">
                      <Money value={line.unit_price} />
                    </td>
                    <td className="p-4 text-right">
                      <Money value={line.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="timeline-heading" className="rounded-lg border bg-surface p-5">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Activity
        </h2>
        {events.isLoading ? (
          <p role="status" className="mt-4 text-sm text-ink-2">
            Loading activity…
          </p>
        ) : events.isError ? (
          <div role="alert" className="mt-4 text-sm">
            Could not load activity.{" "}
            <Button variant="link" onClick={() => events.refetch()}>
              Try again
            </Button>
          </div>
        ) : events.data?.results.length ? (
          <ol className="mt-4 space-y-4">
            {events.data.results.map((event) => (
              <li key={event.id} className="border-l-2 border-primary/30 pl-4">
                <p className="text-sm font-medium">
                  {event.from_status ? `${event.from_status} → ${event.to_status}` : event.to_status}
                </p>
                <p className="mt-1 text-xs text-ink-2">
                  <DateText value={event.created_at} /> · {event.actor?.full_name ?? "System"}
                </p>
                {event.note && <p className="mt-1 whitespace-pre-wrap text-sm">{event.note}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-ink-2">No activity yet.</p>
        )}
        {events.data && (events.data.previous || events.data.next) && (
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous activity page"
              disabled={!events.data.previous}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm text-ink-2">Page {page}</span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next activity page"
              disabled={!events.data.next}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
