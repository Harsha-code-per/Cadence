/** Progress through the current billing period. `progress` (0–1) is computed by the caller from API dates. */
export function CycleRing({ progress, size = 72, label }: { progress: number; size?: number; label?: string }) {
  const p = Math.min(1, Math.max(0, progress));
  const r = 20;
  const c = 2 * Math.PI * r;
  const angle = p * 2 * Math.PI - Math.PI / 2;
  return (
    <figure className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label ?? `${Math.round(p * 100)}% through the period`}>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-line" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform="rotate(-90 24 24)"
          className="stroke-plum"
        />
        <circle cx={24 + r * Math.cos(angle)} cy={24 + r * Math.sin(angle)} r="3" className="fill-marigold" />
      </svg>
      {label && <figcaption className="text-sm text-ink-2">{label}</figcaption>}
    </figure>
  );
}
