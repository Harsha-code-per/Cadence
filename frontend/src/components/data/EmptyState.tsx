/** Says what is missing and offers the action to create it. */
export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-ink-2">{message}</p>
      {action}
    </div>
  );
}
