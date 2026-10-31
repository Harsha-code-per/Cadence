'use client';

import './landing.css';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import BillingDay from './BillingDay';
import DialFallback from './DialFallback';
import LiveStats from './LiveStats';
import MonthStrip from './MonthStrip';
import ProductPeek from './ProductPeek';

gsap.registerPlugin(ScrollTrigger, useGSAP);

// three.js only ever loads on this page, after first paint.
const CycleDial = dynamic(() => import('./CycleDial'), { ssr: false, loading: () => <DialFallback /> });

const HEADLINE = ['Recurring', 'revenue,', 'kept', 'in', 'time.'];

const GUARANTEES = [
  { sql: "UNIQUE (subscription_id, period_start)\nWHERE status <> 'cancelled'", plain: 'A billing period can never be invoiced twice, even when two runs collide.' },
  { sql: 'CHECK (total = subtotal\n  - discount_total + tax_total)', plain: 'Every invoice adds up, or it isn’t saved.' },
  { sql: "CHECK (amount_paid <= total)\nCHECK (status <> 'paid'\n  OR amount_paid = total)", plain: 'No overpayments, and “paid” always means paid in full.' },
];

const ROLES = [
  { name: 'Admin', color: '#F2AE2E', body: 'Sets up products, plans, taxes and discount rules, adds staff, and runs billing on demand.' },
  { name: 'Staff', color: '#C38DC0', body: 'Prepares quotes, moves subscriptions through the pipeline, confirms and sends invoices, records payments.' },
  { name: 'Customer', color: '#4CC3AE', body: 'Sees their own plans and invoices, accepts quotes, and pauses or renews where the plan allows.' },
];

const primaryCta =
  'magnetic inline-flex min-h-12 items-center rounded-md bg-[var(--l-marigold)] px-6 text-base font-semibold text-[var(--l-ink)] transition-colors hover:bg-[#F5BF55]';
const secondaryCta =
  'magnetic inline-flex min-h-12 items-center rounded-md border border-[var(--l-line-strong)] px-6 text-base font-medium transition-colors hover:border-[var(--l-text-3)]';

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="#F2AE2E" strokeWidth="3" strokeDasharray="25 100" strokeLinecap="round" transform="rotate(-90 20 20)" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);
  const invoiceCount = useRef(4181);
  const invoiceLabel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check only exists in the browser
    setMotion(!reduced && canUseWebGL());
    if (reduced) return;

    // Smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in sync.
    const lenis = new Lenis({ autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Magnetic CTAs: buttons lean toward the pointer (fine pointers only).
    const fine = window.matchMedia('(pointer: fine)').matches;
    const cleanups: (() => void)[] = [];
    if (fine) {
      root.current?.querySelectorAll<HTMLElement>('.magnetic').forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: 'power3.out' });
        };
        const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
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

  // The one orchestrated load moment: the headline rises out of its mask, word by word.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ defaults: { ease: 'expo.out' } })
          .from('[data-word]', { yPercent: 110, duration: 1.1, stagger: 0.07 })
          .from('[data-hero-fade]', { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.08 }, '-=0.7');
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const onInvoice = useCallback(() => {
    invoiceCount.current += 1;
    if (invoiceLabel.current) invoiceLabel.current.textContent = `INV/2026/${String(invoiceCount.current).padStart(5, '0')}`;
  }, []);

  return (
    <div ref={root} className="landing min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--l-marigold)] focus:px-4 focus:py-2 focus:text-[var(--l-ink)]">
        Skip to content
      </a>

      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Cadence home">
          <Logo />
          <span className="display text-[22px] font-bold">Cadence</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-6 text-[15px] text-[var(--l-text-2)]">
          <a href="#month" className="hidden hover:text-[var(--l-text)] md:inline">How it works</a>
          <a href="#guarantees" className="hidden hover:text-[var(--l-text)] md:inline">Guarantees</a>
          <a href="#roles" className="hidden hover:text-[var(--l-text)] md:inline">Who it’s for</a>
          <Link href="/login" className="whitespace-nowrap rounded-md border border-[var(--l-line-strong)] px-4 py-2.5 text-[var(--l-text)] hover:border-[var(--l-text-3)]">
            Log in
          </Link>
        </nav>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-24 pt-10 sm:px-10 lg:grid-cols-[1fr_1.05fr]">
          <div className="relative z-10 flex flex-col gap-7">
            <h1 id="hero-title" className="display text-[clamp(3.25rem,7vw,7rem)] font-bold leading-[0.98]" aria-label={HEADLINE.join(' ')}>
              {HEADLINE.map((word, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden="true">
                  <span data-word className="inline-block">
                    {word}
                    {i < HEADLINE.length - 1 ? ' ' : ''}
                  </span>
                </span>
              ))}
            </h1>
            <p data-hero-fade className="max-w-[34rem] text-xl leading-relaxed text-[var(--l-text-2)]">
              Plans, subscriptions, invoices and payments for businesses that earn every month, in one system that bills each period exactly once.
            </p>
            <div data-hero-fade className="flex flex-wrap gap-3.5">
              <Link href="/login" className={primaryCta}>Open the live demo</Link>
              <Link href="/signup" className={secondaryCta}>Create an account</Link>
            </div>
          </div>

          <div className="absolute inset-0 -z-0 opacity-30 lg:relative lg:inset-auto lg:opacity-100">
            <div className="relative mx-auto aspect-square w-full max-w-[600px]">
              {motion ? <CycleDial onInvoice={onInvoice} /> : <DialFallback />}
              <p className="sr-only">
                A dial of four rings for daily, weekly, monthly and yearly plans. Subscriptions orbit at the speed of their cycle, and a marigold hand issues an invoice for each one it passes.
              </p>
              {motion && (
                <div className="num pointer-events-none absolute right-2 top-6 rounded-md bg-[var(--l-raised)] px-3 py-1.5 text-[13px]" aria-hidden="true">
                  <span ref={invoiceLabel}>INV/2026/04181</span>
                </div>
              )}
              <ul className="pointer-events-none absolute bottom-2 left-2 hidden gap-4 text-[13px] text-[var(--l-text-3)] lg:flex" aria-hidden="true">
                <li>daily</li>
                <li>weekly</li>
                <li>monthly</li>
                <li>yearly</li>
              </ul>
            </div>
          </div>
        </section>

        <MonthStrip />
        <BillingDay />

        <section id="guarantees" aria-labelledby="guarantees-title" className="bg-[var(--l-mist)] py-28 text-[var(--l-ink)]">
          <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 sm:px-10">
            <h2 id="guarantees-title" className="display max-w-4xl text-4xl font-bold leading-[1.02] sm:text-6xl">
              Money that can’t go wrong, because the database won’t let it
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {GUARANTEES.map((g) => (
                <figure key={g.plain} className="flex flex-col gap-5 rounded-[20px] bg-[var(--l-ink)] p-8 text-[var(--l-text)]">
                  <pre className="whitespace-pre-wrap font-[inherit] text-[17px] leading-normal text-[var(--l-marigold-text)]">{g.sql}</pre>
                  <figcaption className="text-[17px] leading-normal">{g.plain}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <ProductPeek />

        <section id="roles" aria-labelledby="roles-title" className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-28 sm:px-10">
          <h2 id="roles-title" className="display text-4xl font-bold leading-[1.02] sm:text-6xl">One system, three ways in</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role.name} className="flex flex-col gap-2.5 border-t-[3px] pt-5" style={{ borderColor: role.color }}>
                <h3 className="text-[22px] font-semibold">{role.name}</h3>
                <p className="text-base leading-relaxed text-[var(--l-text-2)]">{role.body}</p>
              </div>
            ))}
          </div>
        </section>

        <LiveStats />

        <section aria-labelledby="cta-title" className="mx-auto flex max-w-7xl flex-col items-start gap-7 px-4 py-32 sm:px-10">
          <h2 id="cta-title" className="display max-w-4xl text-[clamp(2.75rem,6vw,5.5rem)] font-bold leading-none">
            Run next month’s billing before lunch.
          </h2>
          <Link href="/login" className={primaryCta}>Open the live demo</Link>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 border-t border-[var(--l-raised)] px-4 pb-12 pt-8 text-sm text-[var(--l-text-3)] sm:px-10">
        <span>Cadence, built for the Odoo Hackathon by Harsha, Loktrishal, Sanjjith and Cholan.</span>
        <a href="https://github.com/Harsha-code-per/Cadence" className="text-[var(--l-text-2)] underline-offset-4 hover:underline" rel="noopener noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
