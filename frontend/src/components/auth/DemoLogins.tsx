"use client";
import { Check, ChevronDown, Copy, Eye } from "lucide-react";
import { useState } from "react";

/**
 * Public on purpose, for judges. These accounts are read-only on the server
 * (DemoReadOnlyMiddleware), so publishing the password gives nobody the power to change anything.
 */
const DEMO_PASSWORD = "Cadence@Demo2026";
const ACCOUNTS = [
  { role: "Admin", email: "demo.admin@brightloop.test", sees: "Everything: dashboard, pipeline, catalog, staff" },
  { role: "Staff", email: "demo.staff@brightloop.test", sees: "Day-to-day billing, no settings" },
  { role: "Customer", email: "asha@raotraders.test", sees: "Only Asha's own plans and invoices" },
];

export function DemoLogins({ onUse }: { onUse: (email: string, password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(DEMO_PASSWORD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rounded-2xl border border-[var(--l-marigold)]/35 bg-[var(--l-marigold)]/[0.07]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--l-marigold)]"
      >
        <span className="flex items-center gap-2">
          <Eye size={16} className="text-[var(--l-marigold-text)]" aria-hidden /> Show demo logins for judges
        </span>
        <ChevronDown size={16} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--l-marigold)]/20 p-4">
          <ul className="space-y-2">
            {ACCOUNTS.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.role}</p>
                  <p className="truncate text-[13px] text-[var(--l-text-2)]">{a.email}</p>
                  <p className="text-xs text-[var(--l-text-3)]">{a.sees}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUse(a.email, DEMO_PASSWORD)}
                  className="min-h-9 shrink-0 rounded-full bg-[var(--l-marigold)] px-3.5 text-[13px] font-semibold text-[#2a1730] transition-colors hover:bg-[#ffd47a]"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>
              Password for all: <code className="font-semibold text-[var(--l-marigold-text)]">{DEMO_PASSWORD}</code>
            </span>
            <button type="button" onClick={copy} aria-label="Copy demo password" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 hover:bg-white/10">
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              <span role="status">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[var(--l-text-3)]">Read-only: explore everything, but these logins can&rsquo;t change any data.</p>
        </div>
      )}
    </div>
  );
}
