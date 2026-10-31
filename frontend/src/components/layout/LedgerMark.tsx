/** The Cadence mark: three panes of the glass ledger. The front pane takes the text colour. */
export function LedgerMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="14" y="3" width="22" height="28" rx="5" fill="var(--brand)" opacity="0.3" />
      <rect x="9" y="6" width="22" height="28" rx="5" fill="var(--brand)" opacity="0.6" />
      <rect x="4" y="9" width="22" height="28" rx="5" fill="currentColor" />
    </svg>
  );
}
