/** Keep the story readable without making visitors scroll through fixed multi-screen pauses. */
export function pinDistance(chapter: "statement" | "billing" | "month", extent: number): number {
  if (chapter === "statement") return Math.round(Math.min(720, Math.max(420, extent * 0.65)));
  if (chapter === "billing") return Math.round(Math.min(1440, Math.max(900, extent * 1.25)));
  return Math.round(Math.max(1, extent * 0.8));
}
