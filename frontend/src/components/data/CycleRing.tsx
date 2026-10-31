/** Progress through the current billing period (progress 0–1, computed by the caller from API dates). */
export function CycleRing({ progress, size = 96, title, caption }: { progress: number; size?: number; title?: string; caption?: string }) {
  const p = Math.min(1, Math.max(0, progress));
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <figure className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${Math.round(p * 100)} percent through the billing period`}>
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="8" className="stroke-line" />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 48 48)" className="stroke-brand"
        />
        <line x1="48" y1="2" x2="48" y2="18" strokeWidth="4" strokeLinecap="round" className="stroke-brand" transform={`rotate(${p * 360} 48 48)`} />
      </svg>
      {(title || caption) && (
        <figcaption className="flex flex-col gap-1">
          {title && <strong className="text-base font-semibold">{title}</strong>}
          {caption && <span className="text-sm text-ink-2">{caption}</span>}
        </figcaption>
      )}
    </figure>
  );
}
