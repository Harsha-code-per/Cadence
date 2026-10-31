import { AlertCircle, CheckCircle2 } from "lucide-react";

/** Form-level message (credentials, lockout, success). Announced to screen readers. */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  const styles = tone === "error" ? "border-rose/30 bg-rose/8 text-rose" : "border-teal/30 bg-teal/8 text-teal";
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-md border px-3.5 py-3 text-sm ${styles}`}>
      <Icon size={18} className="mt-px shrink-0" aria-hidden />
      <div className="text-ink">{children}</div>
    </div>
  );
}
