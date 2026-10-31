"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CycleRing } from "@/components/data/CycleRing";
import { DateText, Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { InvoiceNow } from "@/components/subscriptions/InvoiceNow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type Paginated } from "@/lib/api";
import { cn } from "@/lib/utils";

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

const STEP = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears } as const;

/** Progress through the current billing period, from the API's own dates (display only). */
function cycleProgress(sub: Subscription) {
  if (!sub.next_invoice_date) return null;
  const step = STEP[sub.plan.billing_period as keyof typeof STEP];
  if (!step) return null;
  const end = parseISO(sub.next_invoice_date);
  const start = step(end, -sub.plan.interval_count);
  const total = Math.max(1, differenceInCalendarDays(end, start));
  const done = Math.min(total, Math.max(0, differenceInCalendarDays(new Date(), start)));
  return { progress: done / total, day: Math.min(total, done + 1), total, label: format(end, "d MMM") };
}

// Timeline dot colour by the status the subscription moved to (docs/DESIGN.md status mapping).
const DOT: Record<string, string> = {
  active: "bg-teal",
  confirmed: "bg-brand",
  quotation: "bg-brand",
  paused: "bg-amber",
  draft: "bg-slate",
  closed: "bg-slate",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium">{children}</dd>
    </div>
  );
}

function Panel({
  id,
  title,
  children,
  flush,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-lg border bg-surface">
      <h2 id={id} className="px-5 pt-5 font-sans text-[17px] font-semibold leading-tight">
        {title}
      </h2>
      <div className={flush ? "mt-3" : "p-5 pt-4"}>{children}</div>
    </section>
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
        <Link href="/subscriptions" className="ml-2 text-brand underline">
          Back to subscriptions
        </Link>
      </div>
    );
  const sub = subscription.data;
  const available = sub.allowed_actions.filter((name) => Object.hasOwn(ACTIONS, name));
  const ring = cycleProgress(sub);
  const primary = available.find((n) => n !== "close");
  return (
    <>
      <Link href="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline">
        <ChevronLeft size={16} /> Subscriptions
      </Link>
      <PageHeader
        title={sub.number}
        description={`${sub.customer.name}${sub.customer.company ? ` · ${sub.customer.company}` : ""}`}
        actions={
          <>
            <StatusBadge domain="subscription" status={sub.status} />
            {sub.status === "draft" && available.includes("send") && (
              <Link
                href={`/subscriptions/${id}/edit`}
                className="inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted"
              >
                Edit draft
              </Link>
            )}
            {available.map((name) => (
              <Button
                key={name}
                variant={name === primary ? "default" : "outline"}
                disabled={action.isPending}
                className={cn(
                  name === "close" &&
                    "border-transparent bg-[color-mix(in_oklab,var(--rose)_13%,var(--surface))] text-rose hover:bg-[color-mix(in_oklab,var(--rose)_20%,var(--surface))]",
                )}
                onClick={() => {
                  action.reset();
                  setNote("");
                  setSelectedAction(name);
                }}
              >
                {ACTIONS[name].label}
              </Button>
            ))}
          </>
        }
      />
      {selectedAction && (
        <section aria-labelledby="action-heading" className="mb-5 rounded-lg border border-brand bg-brand-soft p-5">
          <h2 id="action-heading" className="font-sans text-[17px] font-semibold">
            {ACTIONS[selectedAction].label}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{ACTIONS[selectedAction].description}</p>
          <label className="mt-4 grid max-w-xl gap-1.5 text-sm font-medium">
            Note (optional)
            <Textarea
              maxLength={255}
              className="bg-surface"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {action.error && (
            <p role="alert" className="mt-3 text-sm text-rose">
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
      <InvoiceNow subscriptionId={id} status={sub.status} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel id="overview-heading" title="Overview">
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
          </Panel>

          <Panel id="lines-heading" title="Subscription lines" flush>
            {sub.lines.length === 0 ? (
              <p className="p-5 pt-2 text-sm text-ink-2">No lines have been added yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead className="border-y text-ink-2">
                    <tr>
                      <th className="px-5 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 text-right font-medium">Quantity</th>
                      <th className="px-4 py-3 text-right font-medium">Unit price</th>
                      <th className="px-5 py-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sub.lines.map((line) => (
                      <tr key={line.id} className="border-b">
                        <td className="px-5 py-3">
                          {line.description || line.product_name}
                          {line.variant_label && <span className="block text-xs text-ink-2">{line.variant_label}</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-4 py-3 text-right">
                          <Money value={line.unit_price} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Money value={line.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-right text-ink-2">
                        Recurring total
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">
                        <Money value={sub.recurring_total} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-5" aria-label="Subscription summary">
          <Panel id="cycle-heading" title="Billing cycle">
            {ring ? (
              <CycleRing
                progress={ring.progress}
                title={`Next invoice ${ring.label}`}
                caption={`Day ${ring.day} of ${ring.total} · ${sub.plan.name}`}
              />
            ) : (
              <p className="text-sm text-ink-2">No upcoming invoice. Billing starts once the subscription is active.</p>
            )}
          </Panel>

          <Panel id="timeline-heading" title="Activity">
            {events.isLoading ? (
              <p role="status" className="text-sm text-ink-2">
                Loading activity…
              </p>
            ) : events.isError ? (
              <div role="alert" className="text-sm">
                Could not load activity.{" "}
                <Button variant="link" onClick={() => events.refetch()}>
                  Try again
                </Button>
              </div>
            ) : events.data?.results.length ? (
              <ol className="relative ml-1.5 space-y-5 border-l border-line pl-5">
                {events.data.results.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface",
                        DOT[event.to_status] ?? "bg-slate",
                      )}
                    />
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      {event.from_status && (
                        <>
                          <span className="capitalize text-ink-2">{event.from_status}</span>
                          <span aria-hidden className="text-ink-3">
                            →
                          </span>
                        </>
                      )}
                      <StatusBadge domain="subscription" status={event.to_status} />
                    </p>
                    <p className="mt-1 text-xs text-ink-2">
                      <DateText value={event.created_at} /> · {event.actor?.full_name ?? "System"}
                    </p>
                    {event.note && <p className="mt-1 whitespace-pre-wrap text-sm">{event.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-2">No activity yet.</p>
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
          </Panel>
        </aside>
      </div>
    </>
  );
}
