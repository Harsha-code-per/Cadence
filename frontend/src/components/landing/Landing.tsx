import Link from "next/link";
import { CycleMark } from "@/components/layout/CycleMark";
import { CycleDial } from "@/components/landing/CycleDial";
import { LiveStats } from "@/components/landing/LiveStats";
import { Reveal } from "@/components/landing/Reveal";

const DAYS = [
  { day: "Day 1", title: "A customer signs up", text: "One account per email. Password rules check as they type, and a reset link arrives if they forget.", chips: ["✓ More than 8 characters", "✓ Uppercase and lowercase", "Add a special character"] },
  { day: "Day 3", title: "A new plan launches", text: "Products come in variants. Choosing the Odoo brand adds ₹560, and the plan decides if it can pause, close or renew.", row: ["Brightloop CRM · Brand: Odoo", "₹1,760"] },
  { day: "Day 8", title: "A quote becomes a subscription", text: "Start from a template, send it, and watch it move from draft to active with every step on the timeline.", chips: ["Draft", "Quotation", "Confirmed", "Active"] },
  { day: "Day 15", title: "Billing day", text: "Hundreds of invoices write themselves, taxes included. Run it twice and nothing is billed twice.", row: ["Billing run finished", "0 duplicates"] },
  { day: "Day 18", title: "A customer asks for a better price", text: "The admin sets a rule once. It lands on the next invoice by itself and stops when it expires or runs out." },
  { day: "Day 22", title: "The money comes in", text: "UPI, card, cheque, in parts or in full. Every payment lands on the right invoice and the balance updates." },
  { day: "Day 30", title: "The finance lead's view", text: "Active subscriptions, monthly recurring revenue, what came in and what's overdue, in under two seconds." },
];

const GUARANTEES = [
  { sql: "UNIQUE (subscription_id, period_start)\nWHERE status <> 'cancelled'", text: "A billing period can never be invoiced twice, even when two runs collide." },
  { sql: "CHECK (total = subtotal\n  - discount_total + tax_total)", text: "Every invoice adds up, or it isn't saved." },
  { sql: "CHECK (amount_paid <= total)\nCHECK (status <> 'paid'\n  OR amount_paid = total)", text: "No overpayments, and “paid” always means paid in full." },
];

const ROLES = [
  { role: "Admin", text: "Sets up products, plans, taxes and discount rules, adds staff, and runs billing on demand." },
  { role: "Staff", text: "Prepares quotes, manages subscriptions, confirms and sends invoices, records payments." },
  { role: "Customer", text: "Sees their own plans and invoices, accepts quotes, pauses or renews where the plan allows." },
];

const wrap = "mx-auto w-full max-w-[1280px] px-6 md:px-10";
const primary = "inline-flex min-h-12 items-center rounded-md bg-marigold px-6 text-base font-semibold text-[#2a1730] transition-transform hover:-translate-y-0.5";
const ghost = "inline-flex min-h-12 items-center rounded-md border border-sidebar-muted/50 px-6 text-base font-medium text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent";

/** Always on the aubergine ground, in both themes. All colour comes from the sidebar and marigold tokens. */
export function Landing() {
  return (
    <div className="bg-sidebar text-sidebar-accent-foreground [--sidebar:#2a1730] [--sidebar-accent:#3a2540] [--sidebar-border:#3a2540]">
      <header className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-7`}>
        <Link href="/" className="flex items-center gap-2.5 font-display text-[22px] font-bold tracking-[-0.02em]">
          <CycleMark size={32} /> Cadence
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-7 text-base text-sidebar-foreground">
          <a href="#month" className="hover:text-white">How it works</a>
          <a href="#guarantees" className="hover:text-white">Guarantees</a>
          <a href="#roles" className="hover:text-white">Who it&apos;s for</a>
          <Link href="/login" className="rounded-md border border-sidebar-muted/50 px-4 py-2.5 text-sidebar-accent-foreground hover:bg-sidebar-accent">Log in</Link>
        </nav>
      </header>

      <section className={`${wrap} flex flex-wrap items-center gap-12 pb-24 pt-10 md:pt-16`}>
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-7">
          <h1 className="rise font-display text-[clamp(3.5rem,7vw,7rem)] font-bold leading-[0.98] tracking-[-0.035em]">
            Recurring revenue, kept in time.
          </h1>
          <p className="rise max-w-[520px] text-xl leading-[1.55] text-sidebar-foreground" style={{ animationDelay: "120ms" }}>
            Plans, subscriptions, invoices and payments for businesses that earn every month, in one system that bills each period exactly once.
          </p>
          <div className="rise flex flex-wrap gap-3.5" style={{ animationDelay: "240ms" }}>
            <Link href="/login" className={primary}>Open the live demo</Link>
            <Link href="/signup" className={ghost}>Create an account</Link>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] justify-center">
          <CycleDial />
        </div>
      </section>

      <section id="month" className="border-t border-sidebar-border py-24">
        <Reveal className={`${wrap} flex flex-col gap-4`}>
          <h2 className="max-w-[760px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.03em] md:text-[56px]">A month at Brightloop, without the spreadsheet</h2>
          <p className="max-w-[620px] text-lg leading-[1.55] text-sidebar-foreground">Scroll sideways through one billing month. Each scene is a problem the team faced, and the screen that now handles it.</p>
        </Reveal>
        <div className="mt-12 flex scroll-px-6 snap-x snap-mandatory gap-6 md:scroll-px-10 overflow-x-auto px-6 pb-4 md:px-10" tabIndex={0} aria-label="A billing month, scrolls sideways">
          {DAYS.map((d) => (
            <article key={d.day} className="flex w-[340px] shrink-0 snap-start flex-col gap-4 rounded-[20px] bg-sidebar-accent p-7">
              <span className="font-display text-[40px] font-bold text-marigold">{d.day}</span>
              <h3 className="font-display text-xl font-semibold">{d.title}</h3>
              <p className="text-[15px] leading-[1.55] text-sidebar-foreground">{d.text}</p>
              {d.chips && (
                <div className="mt-auto flex flex-wrap gap-2 text-[13px]">
                  {d.chips.map((c) => <span key={c} className="rounded-full bg-sidebar px-3 py-1">{c}</span>)}
                </div>
              )}
              {d.row && (
                <div className="mt-auto flex items-center justify-between gap-3 rounded-md bg-sidebar px-4 py-3 text-sm">
                  <span>{d.row[0]}</span><strong className="tabular-nums">{d.row[1]}</strong>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="guarantees" className="border-t border-sidebar-border py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <Reveal>
            <h2 className="max-w-[900px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.03em] md:text-[56px]">Money that can&apos;t go wrong, because the database won&apos;t let it</h2>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {GUARANTEES.map((g, i) => (
              <Reveal key={g.text} delay={i * 90} className="flex flex-col gap-5 rounded-[20px] border border-sidebar-border p-7">
                <pre className="whitespace-pre-wrap font-sans text-lg font-medium leading-snug text-marigold">{g.sql}</pre>
                <p className="text-base leading-[1.55] text-sidebar-foreground">{g.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="roles" className="border-t border-sidebar-border py-24">
        <div className={`${wrap} flex flex-col gap-10`}>
          <Reveal><h2 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-[56px]">One system, three ways in</h2></Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {ROLES.map((r, i) => (
              <Reveal key={r.role} delay={i * 90} className="flex flex-col gap-3 border-t-2 border-marigold pt-5">
                <h3 className="font-display text-2xl font-semibold">{r.role}</h3>
                <p className="text-base leading-[1.55] text-sidebar-foreground">{r.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-sidebar-border py-24">
        <div className={wrap}><LiveStats /></div>
      </section>

      <section className="border-t border-sidebar-border py-28">
        <Reveal className={`${wrap} flex flex-col items-start gap-8`}>
          <h2 className="max-w-[900px] font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em] md:text-7xl">Run next month&apos;s billing before lunch.</h2>
          <Link href="/login" className={primary}>Open the live demo</Link>
        </Reveal>
      </section>

      <footer className={`${wrap} flex flex-wrap items-center justify-between gap-4 border-t border-sidebar-border py-8 text-sm text-sidebar-muted`}>
        <span>Cadence, built for the Odoo Hackathon by Harsha, Loktrishal, Sanjjith and Cholan.</span>
        <a href="https://github.com/Harsha-code-per/Cadence" className="text-marigold hover:underline">Source on GitHub</a>
      </footer>
    </div>
  );
}
