import { cn } from "@/lib/utils";

type Tone = "slate" | "plum" | "plum-solid" | "teal" | "amber" | "rose" | "muted";

// Domain → status → tone: docs/DESIGN.md §2 "Status mapping".
const TONES = {
  subscription: { draft: "slate", quotation: "plum", confirmed: "plum-solid", active: "teal", paused: "amber", closed: "muted" },
  invoice: { draft: "slate", confirmed: "plum", paid: "teal", cancelled: "muted", overdue: "rose" },
} as const satisfies Record<string, Record<string, Tone>>;

const STYLE: Record<Tone, string> = {
  slate: "bg-slate/10 text-slate",
  plum: "bg-plum-soft text-plum",
  "plum-solid": "bg-plum text-primary-foreground",
  teal: "bg-teal/10 text-teal",
  amber: "bg-amber/10 text-amber",
  rose: "bg-rose/10 text-rose",
  muted: "bg-slate/10 text-slate/80",
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export function StatusBadge({
  domain,
  status,
  label,
}: {
  domain: keyof typeof TONES;
  status: string;
  label?: string;
}) {
  const tone = (TONES[domain] as Record<string, Tone>)[status] ?? "slate";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLE[tone],
        status === "cancelled" && "line-through",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? sentence(status)}
    </span>
  );
}
