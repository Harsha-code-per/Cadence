/** Shown inside the app so a judge knows why a save was refused. */
export function DemoBanner() {
  return (
    <p role="status" className="bg-marigold-soft px-4 py-2 text-center text-[13px] font-medium text-ink">
      You&rsquo;re exploring a read-only demo. Look around freely; nothing you do here is saved.
    </p>
  );
}
