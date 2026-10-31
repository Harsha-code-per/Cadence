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
    <div className="rounded-lg border bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {delta && <p className={cn("mt-1 text-sm", deltaTone === "teal" ? "text-teal" : "text-rose")}>{delta}</p>}
    </div>
  );
}
