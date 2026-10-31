import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Money({ value, className }: { value: string | number | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatMoney(value)}</span>;
}

export function DateText({ value, className }: { value: string | null | undefined; className?: string }) {
  return (
    <time dateTime={value ?? undefined} className={cn("tabular-nums", className)}>
      {formatDate(value)}
    </time>
  );
}
