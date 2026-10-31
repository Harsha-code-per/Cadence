'use client';

/**
 * Billing day, told by the object itself: as you scroll, the glass invoices flip forward
 * one by one while the counter runs to 412, then a second run bills nothing.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

import { world } from './world';
import { pinDistance } from './scroll-distance';

gsap.registerPlugin(ScrollTrigger, useGSAP);

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
        const steps = gsap.utils.toArray<HTMLElement>('[data-step]');
        const count = { value: 0 };
        root.current?.classList.add('is-scrubbed');
        gsap.set(steps.slice(1), { autoAlpha: 0, y: 24 });
        gsap.set('[data-rerun]', { autoAlpha: 0, y: 12 });
        if (counter.current) counter.current.textContent = '0';

        gsap
          .timeline({
            defaults: { ease: 'power2.inOut' },
            scrollTrigger: {
              trigger: root.current,
              start: 'top top',
              end: () => `+=${pinDistance('billing', window.innerHeight)}`,
              pin: true,
              scrub: 0.3,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                world.sub = Math.min(1, self.progress / 0.8);
              },
            },
          })
          .to({}, { duration: 0.3 })
          .to(steps[0], { autoAlpha: 0, y: -24, duration: 0.25 })
          .to(steps[1], { autoAlpha: 1, y: 0, duration: 0.25 }, '<0.1')
          .to(
            count,
            {
              value: 412,
              duration: 1.5,
              ease: 'none',
              onUpdate: () => {
                if (counter.current) counter.current.textContent = Math.round(count.value).toLocaleString('en-IN');
              },
            },
            0.2,
          )
          .to(steps[1], { autoAlpha: 0, y: -24, duration: 0.25 }, '+=0.1')
          .to(steps[2], { autoAlpha: 1, y: 0, duration: 0.25 }, '<0.1')
          .to('[data-rerun]', { autoAlpha: 1, y: 0, duration: 0.3, ease: 'back.out(2)' })
          .to({}, { duration: 0.35 });
        return () => root.current?.classList.remove('is-scrubbed');
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} data-chapter="3" aria-labelledby="billing-title" className="group/billing relative overflow-hidden py-24 lg:flex lg:min-h-svh lg:items-center lg:py-0">
      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-10">
        <div className="max-w-[560px] space-y-7">
          <h2 id="billing-title" className="display text-[clamp(2.5rem,5.2vw,5.25rem)] font-bold leading-[1]">
            Billing day, without the dread
          </h2>
          <div className="relative group-[.is-scrubbed]/billing:min-h-[132px]">
            {STEPS.map((step) => (
              <div key={step.title} data-step className="mt-6 first:mt-0 group-[.is-scrubbed]/billing:absolute group-[.is-scrubbed]/billing:inset-0 group-[.is-scrubbed]/billing:mt-0">
                <h3 className="text-2xl font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-md text-[17px] leading-relaxed text-[var(--l-text-2)]">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-6" aria-hidden="true">
            <div>
              <span ref={counter} className="display num block text-[clamp(4rem,8vw,7.5rem)] font-bold leading-none text-[var(--l-emerald)]">412</span>
              <span className="text-[15px] text-[var(--l-text-2)]">invoices created</span>
            </div>
            <p data-rerun className="glass rounded-full px-5 py-3 text-[15px]">
              Run billing again: <strong className="num font-semibold text-[var(--l-emerald)]">0 new, 0 duplicates</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
