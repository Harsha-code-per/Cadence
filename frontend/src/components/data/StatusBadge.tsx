import { cn } from "@/lib/utils";

type Tone = "slate" | "plum" | "plum-solid" | "teal" | "amber" | "rose" | "muted";

// Domain → status → tone: docs/DESIGN.md §2 "Status mapping".
const TONES = {
  subscription: { draft: "slate", quotation: "plum", confirmed: "plum-solid", active: "teal", paused: "amber", closed: "muted" },
  invoice: { draft: "slate", confirmed: "plum", paid: "teal", cancelled: "muted", overdue: "rose" },
} as const satisfies Record<string, Record<string, Tone>>;

const STYLE: Record<Tone, string> = {
  slate: "bg-[color-mix(in_oklab,var(--slate)_13%,var(--surface))] text-slate",
  plum: "bg-plum-soft text-plum",
  "plum-solid": "bg-plum text-primary-foreground",
  teal: "bg-[color-mix(in_oklab,var(--teal)_13%,var(--surface))] text-teal",
  amber: "bg-[color-mix(in_oklab,var(--amber)_13%,var(--surface))] text-amber",
  rose: "bg-[color-mix(in_oklab,var(--rose)_13%,var(--surface))] text-rose",
  muted: "bg-[color-mix(in_oklab,var(--slate)_13%,var(--surface))] text-slate/80",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium",
        STYLE[tone],
        status === "cancelled" && "line-through",
      )}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {label ?? sentence(status)}
    </span>
  );
}
