/** The Cadence mark: a ring with a marigold arc. `className` sets the ring colour (currentColor). */
export function CycleMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        className="stroke-marigold"
        strokeWidth="3"
        strokeDasharray="25 100"
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}
