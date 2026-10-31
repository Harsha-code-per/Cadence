import { cn } from "@/lib/utils";

export function KpiTile({
  label,
  value,
  delta,
  deltaTone = "teal",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "teal" | "rose";
}) {
  return (
    <div className="rounded-lg border bg-surface p-5">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-2 font-display text-[34px] font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      {delta && <p className={cn("mt-2 text-[13px]", deltaTone === "teal" ? "text-teal" : "text-rose")}>{delta}</p>}
    </div>
  );
}
