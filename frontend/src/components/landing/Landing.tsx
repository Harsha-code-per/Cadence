'use client';

import './landing.css';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import BillingDay from './BillingDay';
import { canUseWebGL } from './support';
import { world } from './world';
import LiveStats from './LiveStats';
import MonthStrip from './MonthStrip';
import ProductPeek from './ProductPeek';
import Statement from './Statement';

gsap.registerPlugin(ScrollTrigger, useGSAP);

// three.js only ever loads on this page, after first paint.
const Ledger = dynamic(() => import('./Ledger'), { ssr: false });

const LINE_ONE = ['Recurring', 'revenue,'];
const LINE_TWO = ['kept', 'in', 'time.'];

const GUARANTEES = [
  { sql: "UNIQUE (subscription_id, period_start)\nWHERE status <> 'cancelled'", plain: 'A billing period can never be invoiced twice, even when two runs collide.' },
  { sql: 'CHECK (total = subtotal\n  - discount_total + tax_total)', plain: 'Every invoice adds up, or it isn’t saved.' },
  { sql: "CHECK (amount_paid <= total)\nCHECK (status <> 'paid'\n  OR amount_paid = total)", plain: 'No overpayments, and “paid” always means paid in full.' },
];

const ROLES = [
  { name: 'Admin', color: '#0E7A63', body: 'Sets up products, plans, taxes and discount rules, adds staff, and runs billing on demand.' },
  { name: 'Staff', color: '#2C6E91', body: 'Prepares quotes, moves subscriptions through the pipeline, confirms and sends invoices, records payments.' },
  { name: 'Customer', color: '#8FD44F', body: 'Sees their own plans and invoices, accepts quotes, and pauses or renews where the plan allows.' },
];

const primaryCta =
  'magnetic inline-flex min-h-13 items-center rounded-full bg-[var(--l-deep)] px-7 text-base font-semibold text-[#f6f3ea] shadow-[0_18px_40px_-16px_rgb(11_51_40/0.6)] transition-colors hover:bg-[var(--l-emerald)]';
const secondaryCta =
  'magnetic glass inline-flex min-h-13 items-center rounded-full px-7 text-base font-medium transition-colors hover:border-[var(--l-line-strong)]';

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="#0E7A63" strokeWidth="3" strokeDasharray="25 100" strokeLinecap="round" transform="rotate(-90 20 20)" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}

function Words({ words }: { words: string[] }) {
  return words.map((word) => (
    <span key={word} className="mr-[0.22em] inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden="true">
      <span data-word className="inline-block">{word}</span>
    </span>
  ));
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [three, setThree] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check only exists in the browser
    setThree(!reduced && canUseWebGL());
    if (reduced) return;

    // Smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in sync.
    const lenis = new Lenis({ autoRaf: false, lerp: 0.085 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Magnetic CTAs lean toward the pointer (fine pointers only).
    const cleanups: (() => void)[] = [];
    if (window.matchMedia('(pointer: fine)').matches) {
      root.current?.querySelectorAll<HTMLElement>('.magnetic').forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.28, y: (e.clientY - r.top - r.height / 2) * 0.38, duration: 0.4, ease: 'power3.out' });
        };
        const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        cleanups.push(() => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerleave', leave);
        });
      });
    }
    return () => {
      cleanups.forEach((c) => c());
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // The opening: the headline rises into place, word by word.
        gsap
          .timeline({ defaults: { ease: 'expo.out' }, delay: 0.35 })
          .from('[data-word]', { yPercent: 118, rotate: 3, duration: 1.5, stagger: 0.09 })
          .from('[data-hero-fade]', { autoAlpha: 0, y: 22, duration: 1, stagger: 0.1 }, '-=0.95');

        // Leaving the hero, the type drifts up and away as the camera moves on.
        gsap.to('[data-hero-copy]', {
          yPercent: -16,
          autoAlpha: 0,
          ease: 'none',
          scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom 30%', scrub: true },
        });

        // Scrolling off the hero pulls the galaxy of invoices into the ledger.
        ScrollTrigger.create({
          trigger: '[data-hero]',
          start: 'top top',
          end: 'bottom 12%',
          onUpdate: (self) => {
            world.form = self.progress;
          },
        });

        // Each chapter transforms the world as it scrolls in.
        ScrollTrigger.create({
          trigger: '[data-hero]',
          start: 'bottom 40%',
          end: 'max',
          toggleClass: { targets: root.current, className: 'past-hero' },
        });

        gsap.utils.toArray<HTMLElement>('[data-chapter]').forEach((el) => {
          const n = Number(el.dataset.chapter);
          ScrollTrigger.create({
            trigger: el,
            // The ledger has to finish forming before it fans out, and the revenue bars hold before the finale.
            start: n === 1 ? 'top top' : n === 6 ? 'top 70%' : 'top 95%',
            end: n === 1 ? '+=700' : n === 6 ? 'top 5%' : 'top 15%',
            onUpdate: (self) => {
              world.morph = n - 1 + self.progress;
              if (n === 6) world.form = 1 - self.progress; // and it scatters back into a galaxy
            },
          });
        });

        // The header steps aside while reading, and comes back when you scroll up.
        const header = root.current?.querySelector('header');
        ScrollTrigger.create({
          start: 'top top',
          end: 'max',
          onUpdate: (self) => {
            const hide = self.direction === 1 && self.scroll() > window.innerHeight * 0.6;
            gsap.to(header ?? [], { yPercent: hide ? -110 : 0, duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
          },
        });

        ScrollTrigger.sort();
        ScrollTrigger.refresh();
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="landing min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--l-deep)] focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>

      <div className="stage" aria-hidden="true">
        {three && <Ledger world={world} />}
      </div>

      <header className="fixed inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-5 sm:px-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Cadence home">
            <Logo />
            <span className="display text-[22px] font-bold">Cadence</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-7 text-[15px]">
            <a href="#month" className="hidden opacity-85 hover:opacity-100 md:inline">How it works</a>
            <a href="#guarantees" className="hidden opacity-85 hover:opacity-100 md:inline">Guarantees</a>
            <a href="#roles" className="hidden opacity-85 hover:opacity-100 md:inline">Who it’s for</a>
            <Link href="/login" className="whitespace-nowrap rounded-full border border-current/30 px-5 py-2.5 hover:border-current">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="relative z-10">
        <section data-hero aria-labelledby="hero-title" className="relative flex min-h-svh flex-col justify-end lg:justify-center">
          <div data-hero-copy className="mx-auto w-full max-w-[1500px] px-4 pb-10 sm:px-10 lg:pb-0">
            <h1 id="hero-title" aria-label="Recurring revenue, kept in time." className="display max-w-[760px] text-[clamp(3.25rem,6.6vw,7rem)] font-bold leading-[0.96]">
              <span className="block"><Words words={LINE_ONE} /></span>
              <span className="block"><Words words={LINE_TWO} /></span>
            </h1>
            <div className="mt-7 flex max-w-[560px] flex-col gap-7">
              <p data-hero-fade className="max-w-[32rem] text-lg leading-relaxed text-[var(--l-text-2)]">
                Plans, subscriptions, invoices and payments for businesses that earn every month, in one system that bills each period exactly once.
              </p>
              <div data-hero-fade className="flex flex-wrap gap-3.5">
                <Link href="/login" className={primaryCta}>Open the live demo</Link>
                <Link href="/signup" className={secondaryCta}>Create an account</Link>
              </div>
            </div>
          </div>
        </section>

        <Statement />
        <MonthStrip />
        <BillingDay />

        <section id="guarantees" data-chapter="4" aria-labelledby="guarantees-title" className="py-40">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-14 px-4 sm:px-10">
            <h2 id="guarantees-title" className="display max-w-[760px] text-[clamp(2.75rem,5.2vw,5.25rem)] font-bold leading-[1]">
              Money that can’t go wrong, because the database won’t let it
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {GUARANTEES.map((g) => (
                <figure key={g.plain} className="glass flex flex-col justify-between gap-8 rounded-3xl p-8">
                  <pre className="whitespace-pre-wrap font-[inherit] text-lg leading-normal text-[var(--l-emerald)]">{g.sql}</pre>
                  <figcaption className="text-xl leading-snug">{g.plain}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <ProductPeek />

        <section id="roles" aria-labelledby="roles-title" className="mx-auto flex max-w-[1500px] flex-col gap-12 px-4 py-32 sm:px-10">
          <h2 id="roles-title" className="display text-[clamp(2.75rem,5.2vw,5.25rem)] font-bold leading-[1]">One system, three ways in</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role.name} className="glass flex flex-col gap-3 rounded-3xl border-t-[3px] p-8" style={{ borderTopColor: role.color }}>
                <h3 className="text-2xl font-semibold">{role.name}</h3>
                <p className="text-[17px] leading-relaxed text-[var(--l-text-2)]">{role.body}</p>
              </div>
            ))}
          </div>
        </section>

        <LiveStats />

        <section data-chapter="6" aria-labelledby="cta-title" className="flex min-h-[125vh] flex-col justify-end">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col items-start gap-8 px-4 pb-12 sm:px-10">
            <h2 id="cta-title" className="display max-w-[760px] text-[clamp(3rem,6.6vw,7rem)] font-bold leading-[0.96]">
              Run next month’s billing before lunch.
            </h2>
            <Link href="/login" className={primaryCta}>Open the live demo</Link>
            <footer className="mt-12 flex w-full flex-wrap justify-between gap-4 border-t border-[var(--l-line)] pt-6 text-sm text-[var(--l-text-2)]">
              <span>Cadence, built for the Odoo Hackathon by Harsha, Loktrishal, Sanjjith and Cholan.</span>
              <a href="https://github.com/Harsha-code-per/Cadence" className="underline-offset-4 hover:underline" rel="noopener noreferrer">
                Source on GitHub
              </a>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
