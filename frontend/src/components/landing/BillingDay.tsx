'use client';

/**
 * "Billing day", scrubbed by scroll: due subscriptions fly into the invoice tray, the
 * counter runs to 412, then a second run bills nothing (the idempotency guarantee, made
 * visible). Desktop with motion: pinned and scrubbed. Otherwise: the finished state.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const DUE = [
  ['Rao Traders', 'Growth monthly', '₹10,527'],
  ['Menon Logistics', 'Business yearly', '₹1,54,999'],
  ['Khan Textiles', 'Weekly sprint', '₹1,599'],
  ['Pillai Foods', 'Growth monthly', '₹8,299'],
  ['Gupta Retail', 'Starter monthly', '₹2,400'],
  ['Bose Studio', 'Quarterly team', '₹6,197'],
  ['Reddy Motors', 'Business yearly', '₹89,999'],
  ['Iyer Clinics', 'Growth monthly', '₹4,699'],
];

const STEPS = [
  { title: '6:00 am. 412 subscriptions are due.', body: 'Nobody types an invoice. Cadence picks up every subscription whose billing date has arrived.' },
  { title: 'Each one becomes an invoice.', body: 'Customer, product lines, taxes and any discount still in force are filled in from the subscription itself.' },
  { title: 'Run it again. Nothing happens.', body: 'The database refuses a second invoice for the same period, so a double click or a late scheduler can never bill twice.' },
];

export default function BillingDay() {
  const root = useRef<HTMLElement>(null);
  const counter = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const chips = gsap.utils.toArray<HTMLElement>('[data-chip]');
        const steps = gsap.utils.toArray<HTMLElement>('[data-step]');
        const count = { value: 0 };
        root.current?.classList.add('is-scrubbed');
        gsap.set(steps.slice(1), { autoAlpha: 0, y: 24 });
        gsap.set('[data-tray-item]', { autoAlpha: 0, y: -18 });
        gsap.set('[data-rerun]', { autoAlpha: 0, scale: 0.94 });
        if (counter.current) counter.current.textContent = '0';

        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=2400', pin: true, scrub: 0.7, invalidateOnRefresh: true },
        });
        tl.to({}, { duration: 0.4 })
          .to(steps[0], { autoAlpha: 0, y: -24, duration: 0.3 })
          .to(steps[1], { autoAlpha: 1, y: 0, duration: 0.3 }, '<0.1');
        // Each chip flies onto its own invoice row (measured, so it holds at any width).
        const target = (i: number) => document.querySelector<HTMLElement>(`[data-tray-item="${i}"]`);
        const dx = (chip: HTMLElement, i: number) => (target(i)?.getBoundingClientRect().left ?? 0) - chip.getBoundingClientRect().left;
        const dy = (chip: HTMLElement, i: number) => (target(i)?.getBoundingClientRect().top ?? 0) + 18 - chip.getBoundingClientRect().top;
        chips.forEach((chip, i) => {
          tl.to(chip, { x: () => dx(chip, i), y: () => dy(chip, i), rotate: 2, autoAlpha: 0, duration: 0.5, ease: 'power3.in' }, 0.8 + i * 0.12).to(
            `[data-tray-item="${i}"]`,
            { autoAlpha: 1, y: 0, duration: 0.3 },
            1.05 + i * 0.12,
          );
        });
        tl.to(
          count,
          {
            value: 412,
            duration: 1.6,
            ease: 'none',
            onUpdate: () => {
              if (counter.current) counter.current.textContent = Math.round(count.value).toLocaleString('en-IN');
            },
          },
          0.8,
        )
          .to(steps[1], { autoAlpha: 0, y: -24, duration: 0.3 }, '+=0.2')
          .to(steps[2], { autoAlpha: 1, y: 0, duration: 0.3 }, '<0.1')
          .to('[data-rerun]', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' })
          .to({}, { duration: 0.5 });
        return () => root.current?.classList.remove('is-scrubbed');
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} data-chapter="2" aria-labelledby="billing-title" className="group/billing relative overflow-hidden py-24 lg:flex lg:min-h-screen lg:items-center lg:py-0">
      <div className="mx-auto grid w-full max-w-[1500px] items-center gap-14 px-4 sm:px-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <h2 id="billing-title" className="display lift text-[clamp(2.5rem,5.4vw,5.5rem)] font-bold leading-[1]">
            Billing day, without the dread
          </h2>
          <div className="relative group-[.is-scrubbed]/billing:min-h-[150px]">
            {STEPS.map((step) => (
              <div key={step.title} data-step className="mt-6 first:mt-0 group-[.is-scrubbed]/billing:absolute group-[.is-scrubbed]/billing:inset-0 group-[.is-scrubbed]/billing:mt-0">
                <h3 className="text-2xl font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-md text-[17px] leading-relaxed text-[var(--l-text-2)]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-6" aria-hidden="true">
          <div className="glass rounded-3xl p-5">
            <p className="mb-4 text-sm text-[var(--l-text-3)]">Due today</p>
            <ul className="space-y-2.5">
              {DUE.map(([name, plan, amount], i) => (
                <li key={name} data-chip className="flex items-center justify-between rounded-lg bg-white/[0.07] px-3 py-2.5 text-[13px]" style={{ zIndex: DUE.length - i }}>
                  <span>
                    <span className="block font-medium">{name}</span>
                    <span className="text-[var(--l-text-3)]">{plan}</span>
                  </span>
                  <span className="num">{amount}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col rounded-3xl bg-[#fff8ea] p-5 text-[var(--l-ink)] shadow-[0_0_90px_-20px_rgb(255_194_71/0.6)]">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-sm text-[#5e4b66]">Invoices created</p>
              <span ref={counter} className="display num text-4xl font-bold">412</span>
            </div>
            <ul className="space-y-2.5">
              {DUE.map(([name, , amount], i) => (
                <li key={name} data-tray-item={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-[13px] shadow-[0_1px_0_rgb(42_23_48/0.06)]">
                  <span>
                    <span className="block font-medium">INV/2026/{String(18033 + i).padStart(5, '0')}</span>
                    <span className="text-[#5e4b66]">{name} · GST included</span>
                  </span>
                  <span className="num font-medium">{amount}</span>
                </li>
              ))}
            </ul>
            <div data-rerun className="mt-auto flex items-center justify-between rounded-lg border border-[#17806f]/30 bg-[#e2f3ef] px-3 py-3 text-sm">
              <span className="font-medium">Run billing again</span>
              <span className="num font-semibold text-[#17806f]">0 new · 0 duplicates</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
