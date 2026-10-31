"use client";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebounced } from "@/hooks/useDebounced";
import { useUrlState } from "@/hooks/useUrlState";

/** Search box (300 ms debounce) synced to ?search=. Put extra filter controls in `children`. */
export function FilterBar({ placeholder = "Search", children }: { placeholder?: string; children?: React.ReactNode }) {
  const url = useUrlState();
  const [text, setText] = useState(url.get("search"));
  const debounced = useDebounced(text);
  const current = url.get("search");
  useEffect(() => {
    if (debounced !== current) url.set({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-72">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input aria-label={placeholder} className="pl-8" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {children}
    </div>
  );
}
