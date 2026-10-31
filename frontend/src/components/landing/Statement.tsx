'use client';

/** The thesis, read at scroll speed: each word lights up as you pass it. */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TEXT = 'Every subscription runs on its own clock. Daily, weekly, monthly, yearly. Spreadsheets lose the beat. Cadence keeps every one of them in time.';

export default function Statement() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-lit]', {
          opacity: 0.16,
          stagger: 0.1,
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=1500', pin: true, scrub: 0.6 },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-label="Why Cadence" className="flex min-h-svh items-center">
      <p className="display lift mx-auto max-w-[1300px] px-4 text-[clamp(2.25rem,5.6vw,5.75rem)] font-semibold leading-[1.06] sm:px-10">
        {TEXT.split(' ').map((word, i) => (
          <span key={i} data-lit className="mr-[0.24em] inline-block">{word}</span>
        ))}
      </p>
    </section>
  );
}
