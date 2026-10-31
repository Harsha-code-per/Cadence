'use client';

/**
 * "A month at Brightloop": the brief's seven scenes as a real timeline (Day 1 → Day 30).
 * Desktop: the section pins and scrolls sideways while a month-progress bar fills.
 * Mobile or reduced motion: a plain horizontal list with scroll snap.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef, type ReactNode } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Scene = { day: number; title: string; body: string; fragment?: ReactNode };

const pill = 'rounded-full px-2 py-0.5 text-xs font-medium';

const SCENES: Scene[] = [
  {
    day: 1,
    title: 'A customer signs up',
    body: 'One account per email. Password rules check as they type, and a reset link arrives if they forget.',
    fragment: (
      <ul className="space-y-1 text-[13px]">
        <li className="text-[#17806F]">✓ More than 8 characters</li>
        <li className="text-[#17806F]">✓ Uppercase and lowercase</li>
        <li className="text-[#A12A40]">Add a special character</li>
      </ul>
    ),
  },
  {
    day: 3,
    title: 'A new plan launches',
    body: 'Products come in variants. Choosing the Odoo brand adds ₹560, and each plan decides whether it can pause, close or renew.',
    fragment: (
      <div className="num flex justify-between text-sm">
        <span>Brightloop CRM · Brand: Odoo</span>
        <strong className="font-semibold">₹1,760</strong>
      </div>
    ),
  },
  {
    day: 8,
    title: 'A quote becomes a subscription',
    body: 'Start from a template, send it, and watch it move from draft to active with every step on the timeline.',
    fragment: (
      <div className="flex flex-wrap gap-1.5">
        <span className={`${pill} bg-[#EEEFF2]`}>Draft</span>
        <span className={`${pill} bg-[#F1E8F0]`}>Quotation</span>
        <span className={`${pill} bg-[#6B3F69] text-white`}>Confirmed</span>
        <span className={`${pill} bg-[#E2F3EF]`}>Active</span>
      </div>
    ),
  },
  {
    day: 15,
    title: 'Billing day',
    body: 'Hundreds of invoices write themselves, taxes included. Run it twice and nothing is billed twice.',
    fragment: (
      <div className="text-[13px]">
        <strong className="block font-semibold">Billing run finished</strong>
        <span>412 invoices created · 0 duplicates</span>
      </div>
    ),
  },
  {
    day: 18,
    title: 'A customer asks for a better price',
    body: 'The admin sets a rule once. It lands on the next invoice by itself and stops when it expires or runs out.',
    fragment: (
      <div className="num flex justify-between text-[13px]">
        <span>Bulk seats 10% · 2 of 3 uses left</span>
        <strong className="font-semibold text-[#17806F]">−₹880</strong>
      </div>
    ),
  },
  {
    day: 22,
    title: 'The money comes in',
    body: 'UPI, card, cheque, in parts or in full. Every payment lands on the right invoice and the balance updates.',
    fragment: (
      <div className="num flex justify-between text-[13px]">
        <span>INV/2026/04182 · UPI</span>
        <span className={`${pill} bg-[#E2F3EF]`}>Paid</span>
      </div>
    ),
  },
  {
    day: 30,
    title: "The finance lead's view",
    body: "Active subscriptions, monthly recurring revenue, what came in and what's overdue, in under two seconds.",
    fragment: (
      <div className="num grid grid-cols-2 gap-2 text-[13px]">
        <span>MRR <strong className="block text-base font-semibold">₹38.6 L</strong></span>
        <span>Overdue <strong className="block text-base font-semibold text-[#A12A40]">37</strong></span>
      </div>
    ),
  },
];

export default function MonthStrip() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const progress = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
        const el = track.current!;
        const distance = () => el.scrollWidth - window.innerWidth + 80;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section.current,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        tl.to(el, { x: () => -distance(), ease: 'none' }, 0).fromTo(
          progress.current,
          { scaleX: 0 },
          { scaleX: 1, ease: 'none' },
          0,
        );
      });
      return () => mm.revert();
    },
    { scope: section },
  );

  return (
    <section
      ref={section}
      id="month"
      data-chapter="1"
      aria-labelledby="month-title"
      className="overflow-hidden py-24 md:flex md:min-h-screen md:flex-col md:justify-center"
    >
      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-10">
        <h2 id="month-title" className="display lift max-w-4xl text-[clamp(2.5rem,5.4vw,5.5rem)] font-bold leading-[1]">
          A month at Brightloop, without the spreadsheet
        </h2>
        <p className="lift mt-4 max-w-xl text-lg leading-relaxed text-[var(--l-text-2)]">
          One billing month, scene by scene: each problem the team faced, and the screen that now handles it.
        </p>
        <div className="mt-8 hidden items-center gap-4 text-sm text-[var(--l-text-3)] md:flex" aria-hidden="true">
          <span>Day 1</span>
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
            <div ref={progress} className="h-full origin-left scale-x-0 bg-[var(--l-marigold)]" />
          </div>
          <span>Day 30</span>
        </div>
      </div>
      <ol
        ref={track}
        className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 sm:px-10 md:overflow-visible md:pb-0"
      >
        {SCENES.map((scene) => (
          <li
            key={scene.day}
            className="glass flex w-[300px] shrink-0 snap-start flex-col gap-4 rounded-3xl p-7 sm:w-[350px]"
          >
            <span className="display text-4xl font-bold text-[var(--l-marigold)]">Day {scene.day}</span>
            <h3 className="text-xl font-semibold">{scene.title}</h3>
            <p className="text-[15px] leading-relaxed text-[var(--l-text-2)]">{scene.body}</p>
            {scene.fragment && (
              <div className="mt-auto rounded-[10px] bg-white p-4 text-[var(--l-ink)]">{scene.fragment}</div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
