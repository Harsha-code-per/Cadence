'use client';

/** "The finance lead's view": a dashboard panel that tilts into place as it scrolls in. */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const KPIS = [
  ['Active subscriptions', '3,497', '+126 this month', '#0e7a63'],
  ['Monthly recurring revenue', '₹38.6 L', '+4.2% this month', '#0e7a63'],
  ['Collected this month', '₹31.2 L', '82% of invoiced', '#3f5851'],
  ['Overdue', '₹4.9 L', '37 invoices to chase', '#c2364f'],
];
const BARS = [62, 64, 66, 70, 71, 74, 78, 80, 83, 86, 90, 94];

export default function ProductPeek() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-panel]',
          { rotateX: 28, y: 80, scale: 0.92, transformPerspective: 1400 },
          { rotateX: 0, y: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 25%', scrub: 0.6 } },
        );
        gsap.from('[data-bar]', {
          scaleY: 0,
          transformOrigin: 'bottom',
          stagger: 0.04,
          ease: 'power3.out',
          duration: 0.8,
          scrollTrigger: { trigger: '[data-panel]', start: 'top 60%' },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} data-chapter="5" aria-labelledby="peek-title" className="overflow-hidden pb-32">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-10">
        <div className="flex min-h-svh max-w-[560px] flex-col justify-center">
        <h2 id="peek-title" className="display text-[clamp(2.75rem,5.2vw,5.25rem)] font-bold leading-[1]">
          The month-end report, already written
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--l-text-2)]">
          Recurring revenue, cash collected and what&rsquo;s overdue, kept separate and always current. Every page answers in well under two seconds.
        </p>
        </div>
        <div data-panel className="glass rounded-3xl p-5 sm:p-7" aria-hidden="true">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {KPIS.map(([label, value, delta, color]) => (
              <div key={label} className="rounded-[10px] bg-white p-4">
                <p className="text-[13px] text-[var(--l-text-2)]">{label}</p>
                <p className="display num mt-1.5 text-3xl font-semibold">{value}</p>
                <p className="mt-1 text-[12px]" style={{ color }}>{delta}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-[10px] bg-white p-4">
              <p className="mb-4 text-sm font-medium">Invoiced and collected</p>
              <div className="flex h-40 items-end gap-2">
                {BARS.map((h, i) => (
                  <div key={i} className="flex h-full flex-1 items-end gap-0.5">
                    <div data-bar className="w-1/2 rounded-t-sm bg-[var(--l-deep)]" style={{ height: `${h}%` }} />
                    <div data-bar className="w-1/2 rounded-t-sm bg-[#8fd44f]" style={{ height: `${h - 3 - (i % 3)}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[10px] bg-white p-4 text-[13px]">
              <p className="mb-3 text-sm font-medium">Overdue, by age</p>
              {[
                ['1–7 days', 46, '₹1.2 L'],
                ['8–30 days', 30, '₹2.1 L'],
                ['31–60 days', 16, '₹1.1 L'],
                ['60+ days', 8, '₹0.5 L'],
              ].map(([label, pct, amount]) => (
                <div key={label as string} className="mb-3">
                  <div className="mb-1 flex justify-between">
                    <span className="text-[var(--l-text-2)]">{label}</span>
                    <span className="num">{amount}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--l-line)]">
                    <div className="h-full rounded-full bg-[#c2364f]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
