"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, List, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, type Paginated } from "@/lib/api";
import { formatDate, formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Brief, scene 3: "It moves from Draft to Quotation to Confirmed to Active and finally to
   Closed, and anyone on the team should be able to see where it stands." */

type Stage = "draft" | "quotation" | "confirmed" | "active" | "paused" | "closed";
type Card = {
  id: number;
  number: string;
  status: Stage;
  customer: { id: number; name: string; company: string };
  plan: { name: string; billing_period: string };
  recurring_total: string;
  next_invoice_date: string | null;
  valid_until: string | null;
  allowed_actions: string[];
};
type PipelineStage = { status: Stage; count: number; recurring_value: string };

const STAGES: { status: Stage; label: string; hint: string }[] = [
  { status: "draft", label: "Draft", hint: "Being prepared" },
  { status: "quotation", label: "Quotation", hint: "Sent, awaiting the customer" },
  { status: "confirmed", label: "Confirmed", hint: "Accepted, starts on its date" },
  { status: "active", label: "Active", hint: "Billing on schedule" },
  { status: "paused", label: "Paused", hint: "Not billed while paused" },
  { status: "closed", label: "Closed", hint: "Ended" },
];

/** Which state-machine action moves a card from one column to another (server decides if it's allowed). */
const MOVES: Partial<Record<Stage, Partial<Record<Stage, string>>>> = {
  draft: { quotation: "send", closed: "close" },
  quotation: { draft: "revise", confirmed: "confirm", closed: "close" },
  confirmed: { active: "activate" },
  active: { paused: "pause", closed: "close" },
  paused: { active: "resume", closed: "close" },
};
const DONE: Record<string, string> = {
  send: "Quotation sent",
  revise: "Moved back to draft",
  confirm: "Quotation confirmed",
  activate: "Activated, first invoice created",
  pause: "Subscription paused",
  resume: "Subscription resumed",
  close: "Subscription closed",
};

const moveFor = (card: Card, to: Stage) => {
  const action = MOVES[card.status]?.[to];
  return action && card.allowed_actions.includes(action) ? action : null;
};

const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export default function SubscriptionBoardPage() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [closing, setClosing] = useState<Card | null>(null);
  const [reason, setReason] = useState("");
  const [limits, setLimits] = useState<Record<Stage, number>>({ draft: 12, quotation: 12, confirmed: 12, active: 12, paused: 12, closed: 6 });

  const pipeline = useQuery({ queryKey: ["analytics", "pipeline"], queryFn: () => api.get<PipelineStage[]>("/analytics/pipeline/") });
  const totals = Object.fromEntries((pipeline.data ?? []).map((s) => [s.status, s])) as Partial<Record<Stage, PipelineStage>>;

  const move = useMutation({
    mutationFn: ({ card, action, note }: { card: Card; action: string; note?: string }) =>
      api.post<Card>(`/subscriptions/${card.id}/${action}/`, note ? { note } : {}),
    onSuccess: (_, { card, action }) => {
      toast.success(DONE[action] ?? "Updated", { description: `${card.number} · ${card.customer.name}` });
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "That change didn't go through. Try again."),
  });

  function request(card: Card, to: Stage) {
    const action = moveFor(card, to);
    if (!action) return;
    if (action === "close") {
      setReason("");
      setClosing(card);
    } else {
      move.mutate({ card, action });
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-5">
      <PageHeader
        title="Subscription pipeline"
        description="Every subscription by stage. Drag a card to move it, or use its menu. Only moves the plan allows are offered."
        actions={
          <Link href="/subscriptions" className={buttonVariants({ variant: "outline" })}>
            <List size={16} /> List view
          </Link>
        }
      />

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" role="list" aria-label="Subscription stages">
        {STAGES.map((stage) => {
          const canDrop = !!dragging && !!moveFor(dragging, stage.status);
          return (
            <section
              key={stage.status}
              role="listitem"
              aria-labelledby={`col-${stage.status}`}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                setOver(stage.status);
              }}
              onDragLeave={() => setOver((o) => (o === stage.status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && canDrop) request(dragging, stage.status);
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "flex min-w-0 flex-col rounded-[10px] border bg-surface/60 transition-colors",
                dragging && !canDrop && dragging.status !== stage.status && "opacity-55",
                canDrop && "border-dashed border-brand/60",
                over === stage.status && "border-solid border-brand bg-brand-soft/60",
              )}
            >
              <header className="space-y-1 border-b px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 id={`col-${stage.status}`} className="flex items-center gap-2">
                    <StatusBadge domain="subscription" status={stage.status} label={stage.label} />
                  </h2>
                  <span className="text-sm tabular-nums text-ink-2" aria-label={`${totals[stage.status]?.count ?? 0} subscriptions`}>
                    {totals[stage.status]?.count?.toLocaleString("en-IN") ?? "…"}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-2">{stage.hint}</p>
                <p className="h-5 text-sm font-semibold tabular-nums text-ink">
                  {totals[stage.status] ? `${formatMoneyCompact(totals[stage.status]!.recurring_value)}/cycle` : ""}
                </p>
              </header>
              <Column
                stage={stage.status}
                limit={limits[stage.status]}
                onMore={() => setLimits((l) => ({ ...l, [stage.status]: Math.min(l[stage.status] + 24, 100) }))}
                onDragStart={setDragging}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onMove={request}
                pending={move.isPending ? move.variables?.card.id : undefined}
              />
            </section>
          );
        })}
      </div>

      <Dialog open={closing !== null} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {closing?.number}?</DialogTitle>
            <DialogDescription>
              {closing?.customer.name} stops being billed. Past invoices and payments stay as they are.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Reason (shown on the timeline)</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: moved to another provider" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Keep it</Button>
            <Button
              variant="destructive"
              disabled={move.isPending}
              onClick={() => closing && move.mutate({ card: closing, action: "close", note: reason.trim() }, { onSettled: () => setClosing(null) })}
            >
              Close subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Column({
  stage,
  limit,
  onMore,
  onDragStart,
  onDragEnd,
  onMove,
  pending,
}: {
  stage: Stage;
  limit: number;
  onMore: () => void;
  onDragStart: (card: Card) => void;
  onDragEnd: () => void;
  onMove: (card: Card, to: Stage) => void;
  pending?: number;
}) {
  const list = useQuery({
    queryKey: ["board", stage, limit],
    queryFn: () => api.get<Paginated<Card>>("/subscriptions/", { status: stage, page_size: limit, ordering: "-updated_at" }),
    placeholderData: (prev) => prev,
  });

  if (list.isPending) {
    return (
      <div className="space-y-2 p-2.5" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-md bg-line/50" />
        ))}
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <p className="text-sm text-rose">Couldn&apos;t load this stage.</p>
        <Button variant="outline" size="sm" onClick={() => list.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const cards = list.data.results;

  return (
    <ul className="flex h-[26rem] flex-col gap-2 overflow-y-auto p-2.5 [scrollbar-width:thin] 2xl:h-[calc(100dvh-19rem)] 2xl:min-h-[26rem]" aria-label={`${stage} subscriptions`}>
      {cards.length === 0 && <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-ink-2">Nothing here right now.</li>}
      {cards.map((card) => (
        <SubscriptionCard key={card.id} card={card} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={onMove} pending={pending === card.id} />
      ))}
      {list.data.count > cards.length && limit < 100 && (
        <li>
          <Button variant="ghost" size="sm" className="w-full" onClick={onMore}>
            Show more ({(list.data.count - cards.length).toLocaleString("en-IN")} more)
          </Button>
        </li>
      )}
    </ul>
  );
}

function SubscriptionCard({
  card,
  onDragStart,
  onDragEnd,
  onMove,
  pending,
}: {
  card: Card;
  onDragStart: (card: Card) => void;
  onDragEnd: () => void;
  onMove: (card: Card, to: Stage) => void;
  pending: boolean;
}) {
  const targets = STAGES.filter((s) => moveFor(card, s.status));
  const expiring = card.status === "quotation" && card.valid_until ? daysUntil(card.valid_until) : null;

  return (
    <li
      draggable={targets.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.number);
        onDragStart(card);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-md border bg-surface p-3 shadow-[0_1px_0_rgb(42_23_48/0.04)] transition-[transform,box-shadow] duration-150",
        targets.length > 0 && "cursor-grab active:cursor-grabbing hover:-translate-y-px hover:shadow-float",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/subscriptions/${card.id}`} className="min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-brand">
          <span className="block break-words text-[13px] font-medium text-brand">{card.number}</span>
          <span className="block break-words text-sm font-medium text-ink">{card.customer.name}</span>
          {card.customer.company && <span className="block break-words text-xs text-ink-2">{card.customer.company}</span>}
        </Link>
        {targets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label={`Move ${card.number}`}
                />
              }
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <ArrowRightLeft size={14} /> Move to
                </DropdownMenuLabel>
                {targets.map((t) => (
                  <DropdownMenuItem key={t.status} onClick={() => onMove(card, t.status)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2 text-xs">
        <span className="min-w-0 break-words text-ink-2">{card.plan.name}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
          <Money value={card.recurring_total} />
        </span>
      </div>
      {(card.next_invoice_date || expiring !== null) && (
        <p className={cn("mt-2 border-t pt-2 text-xs", expiring !== null && expiring <= 2 ? "font-medium text-amber" : "text-ink-2")}>
          {expiring !== null
            ? expiring < 0
              ? "Quotation expired"
              : expiring === 0
                ? "Quotation expires today"
                : `Quotation expires in ${expiring} day${expiring === 1 ? "" : "s"}`
            : `Next invoice ${formatDate(card.next_invoice_date)}`}
        </p>
      )}
    </li>
  );
}
