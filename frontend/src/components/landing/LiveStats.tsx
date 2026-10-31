'use client';

/** Real numbers from GET /api/public/stats/ (aggregates only). No static JSON. */
import { useEffect, useState } from 'react';

type Stats = { active_subscriptions: number; invoices_issued: number; revenue_collected: string };

const count = new Intl.NumberFormat('en-IN');
const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export default function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/stats/', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setStats)
      .catch((err) => {
        if (err?.name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const items = [
    { value: stats && count.format(stats.active_subscriptions), label: 'active subscriptions right now' },
    { value: stats && count.format(stats.invoices_issued), label: 'invoices issued' },
    { value: stats && rupees.format(Number(stats.revenue_collected)), label: 'collected, live from the demo database' },
  ];

  return (
    <section aria-label="Live numbers" >
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-16 sm:grid-cols-3 sm:px-10" aria-live="polite">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1.5">
            <span className="display num text-[clamp(3rem,6vw,6rem)] font-bold leading-none">
              {item.value ?? (failed ? '—' : <span className="inline-block h-12 w-40 animate-pulse rounded bg-[var(--l-line)]" />)}
            </span>
            <span className="text-[15px] text-[var(--l-text-2)]">{item.label}</span>
          </div>
        ))}
      </div>
      {failed && (
        <p className="mx-auto max-w-[1500px] px-4 pb-8 text-sm text-[var(--l-text-3)] sm:px-10">
          Live numbers show up when the demo API is reachable.
        </p>
      )}
    </section>
  );
}
