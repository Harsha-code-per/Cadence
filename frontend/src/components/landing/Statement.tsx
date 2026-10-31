'use client';

/** The thesis, read at scroll speed: each word darkens as you pass it. */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';
import { pinDistance } from './scroll-distance';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TEXT = 'A subscription business earns every month, not just once. Twelve invoices a year, for every customer. Spreadsheets lose track. Cadence keeps every one exact.';

export default function Statement() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-lit]', {
          opacity: 0.14,
          stagger: 0.1,
          ease: 'none',
          scrollTrigger: {
            trigger: root.current, start: 'top top',
            end: () => `+=${pinDistance('statement', window.innerHeight)}`,
            pin: true, scrub: 0.3, invalidateOnRefresh: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} data-chapter="1" aria-label="Why Cadence" className="flex min-h-svh items-center">
      <p className="display mx-auto w-full max-w-[1500px] px-4 text-[clamp(2.25rem,4vw,4.25rem)] font-semibold leading-[1.1] sm:px-10">
        <span className="block max-w-[760px]">
          {TEXT.split(' ').map((word, i) => (
            <span key={i} data-lit className="mr-[0.24em] inline-block">{word}</span>
          ))}
        </span>
      </p>
    </section>
  );
}
