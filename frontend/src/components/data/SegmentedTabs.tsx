"use client";
import { cn } from "@/lib/utils";

/** Pill-style view switcher (same look as the filter chips in the design reference). */
export function SegmentedTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              on ? "border-brand bg-brand-soft font-medium text-ink" : "border-line bg-surface text-ink hover:bg-brand-soft/60",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
