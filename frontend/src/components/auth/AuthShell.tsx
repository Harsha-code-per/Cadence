import Link from "next/link";
import { CycleMark } from "@/components/layout/CycleMark";

/** Split auth layout: brand panel (hidden on small screens) + a calm, single-column form. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-[#2a1730] p-12 text-[#f3eef5] lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-[#f3eef5]" aria-label="Cadence home">
          <CycleMark size={32} />
          <span className="font-display text-2xl font-bold tracking-tight">Cadence</span>
        </Link>
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute -right-24 top-1/2 w-[520px] -translate-y-1/2 opacity-60" aria-hidden>
          {[180, 135, 90, 48].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#5a3f62" strokeWidth="1.2" />
          ))}
          <path d="M200 200 L200 20 A180 180 0 0 1 327 73 Z" fill="#f2ae2e" opacity="0.08" />
          <line x1="200" y1="200" x2="327" y2="73" stroke="#f2ae2e" strokeWidth="2.5" strokeLinecap="round" className="origin-center motion-safe:animate-[spin_24s_linear_infinite]" style={{ transformOrigin: "200px 200px" }} />
          <circle cx="200" cy="200" r="6" fill="#f2ae2e" />
        </svg>
        <blockquote className="relative max-w-sm space-y-4">
          <p className="font-display text-4xl font-bold leading-[1.05] tracking-tight">Every subscription, billed exactly once.</p>
          <p className="text-[15px] leading-relaxed text-[#d9cedd]">Plans, quotes, invoices and payments for Brightloop, in one place, with the numbers always up to date.</p>
        </blockquote>
      </aside>
      <main className="flex items-center justify-center bg-canvas px-4 py-12 sm:px-8">
        <div className="w-full max-w-[420px] space-y-8">
          <Link href="/" className="flex items-center gap-2 text-ink lg:hidden" aria-label="Cadence home">
            <CycleMark size={28} />
            <span className="font-display text-xl font-bold">Cadence</span>
          </Link>
          <header className="space-y-2">
            <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
          </header>
          {children}
          {footer && <div className="text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
