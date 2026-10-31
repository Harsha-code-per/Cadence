import { cn } from "@/lib/utils";

type Tone = "slate" | "brand" | "brand-solid" | "sky" | "teal" | "amber" | "rose" | "muted";

// Domain → status → tone: docs/DESIGN.md §2 "Status mapping".
const TONES = {
  subscription: { draft: "slate", quotation: "sky", confirmed: "brand-solid", active: "teal", paused: "amber", closed: "muted" },
  invoice: { draft: "slate", confirmed: "brand", paid: "teal", cancelled: "muted", overdue: "rose" },
} as const satisfies Record<string, Record<string, Tone>>;

const STYLE: Record<Tone, string> = {
  slate: "bg-[color-mix(in_oklab,var(--slate)_13%,var(--surface))] text-[color-mix(in_oklab,var(--slate)_72%,var(--ink))]",
  brand: "bg-brand-soft text-brand",
  "brand-solid": "bg-brand-deep text-primary-foreground",
  sky: "bg-[color-mix(in_oklab,var(--sky)_13%,var(--surface))] text-[color-mix(in_oklab,var(--sky)_78%,var(--ink))]",
  teal: "bg-[color-mix(in_oklab,var(--teal)_13%,var(--surface))] text-[color-mix(in_oklab,var(--teal)_72%,var(--ink))]",
  amber: "bg-[color-mix(in_oklab,var(--amber)_13%,var(--surface))] text-[color-mix(in_oklab,var(--amber)_72%,var(--ink))]",
  rose: "bg-[color-mix(in_oklab,var(--rose)_13%,var(--surface))] text-[color-mix(in_oklab,var(--rose)_72%,var(--ink))]",
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

/** Catalog on/off state: teal "Active" or slate "Inactive", dot plus label. */
export function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge domain="subscription" status={active ? "active" : "closed"} label={active ? "Active" : "Inactive"} />;
}
