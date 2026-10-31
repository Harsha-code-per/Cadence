"use client";
import { useEffect, useRef } from "react";

// Rings are billing cycles; inner = daily (fastest), outer = yearly (slowest). Speeds are in rad/s, scaled for the eye.
const RINGS = [
  { r: 72, label: "daily", n: 14, w: 0.5 },
  { r: 130, label: "weekly", n: 22, w: 0.26 },
  { r: 190, label: "monthly", n: 30, w: 0.14 },
  { r: 250, label: "yearly", n: 36, w: 0.07 },
];
const HAND = 0.62; // sweep hand, rad/s
const TAU = Math.PI * 2;
const r1 = (v: number) => Math.round(v * 10) / 10; // rounded so server and client markup match exactly

// Deterministic pseudo-random so server and client markup agree.
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const PARTICLES = RINGS.flatMap((ring, ri) =>
  Array.from({ length: ring.n }, (_, i) => ({ ring: ri, a0: (i / ring.n) * TAU + rand(ri * 100 + i) * 0.4, size: r1(2.5 + rand(i + ri) * 3) })),
);

/** The product idea, drawn: subscriptions orbit at their real cycle speeds; a marigold hand "issues an invoice" as it passes each one. */
export function CycleDial({ onCount }: { onCount?: (n: number) => void }) {
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const flashes = useRef<(SVGCircleElement | null)[]>([]);
  const hand = useRef<SVGGElement>(null);
  const counter = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = PARTICLES.map(() => 0); // flash intensity 0..1
    let count = 0;
    let handA = -Math.PI / 2;
    let last = performance.now();
    let t = 0;
    let raf = 0;

    const place = () => {
      PARTICLES.forEach((p, i) => {
        const ring = RINGS[p.ring];
        const a = p.a0 + t * ring.w;
        const x = 280 + ring.r * Math.cos(a);
        const y = 280 + ring.r * Math.sin(a);
        dots.current[i]?.setAttribute("cx", x.toFixed(1));
        dots.current[i]?.setAttribute("cy", y.toFixed(1));
        const f = flashes.current[i];
        if (f) {
          f.setAttribute("cx", x.toFixed(1));
          f.setAttribute("cy", y.toFixed(1));
          f.setAttribute("r", (5 + (1 - state[i]) * 12).toFixed(1));
          f.setAttribute("opacity", state[i].toFixed(2));
        }
      });
      hand.current?.setAttribute("transform", `rotate(${((handA * 180) / Math.PI).toFixed(2)} 280 280)`);
    };

    if (reduced) {
      place();
      return;
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const prev = handA;
      handA += HAND * dt;
      PARTICLES.forEach((p, i) => {
        state[i] = Math.max(0, state[i] - dt * 1.4);
        const ring = RINGS[p.ring];
        const a = p.a0 + t * ring.w;
        // The hand "bills" a subscription when it overtakes it: the particle's lead over the hand wraps from ~0 to ~TAU.
        const aPrev = p.a0 + (t - dt) * ring.w;
        const relPrev = (((aPrev - prev) % TAU) + TAU) % TAU;
        const relNow = (((a - handA) % TAU) + TAU) % TAU;
        if (relNow - relPrev > Math.PI) {
          state[i] = 1;
          count++;
          if (counter.current) counter.current.textContent = count.toLocaleString("en-IN");
          onCount?.(count);
        }
      });
      place();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onCount]);

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <svg
        viewBox="0 0 560 560"
        className="h-auto w-full"
        role="img"
        aria-label="Cycle dial: daily, weekly, monthly and yearly rings with subscriptions orbiting and a marigold sweep hand billing them"
      >
        {RINGS.map((ring, i) => (
          <circle key={ring.label} cx="280" cy="280" r={ring.r} fill="none" strokeWidth="1.5" className="stroke-sidebar-border dial-draw" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
        <g className="stroke-sidebar-muted" strokeWidth="2">
          <line x1="280" y1="22" x2="280" y2="38" /><line x1="280" y1="522" x2="280" y2="538" />
          <line x1="22" y1="280" x2="38" y2="280" /><line x1="522" y1="280" x2="538" y2="280" />
        </g>
        {PARTICLES.map((p, i) => {
          const ring = RINGS[p.ring];
          const a = p.a0;
          return (
            <g key={i}>
              <circle ref={(el) => void (flashes.current[i] = el)} cx={r1(280 + ring.r * Math.cos(a))} cy={r1(280 + ring.r * Math.sin(a))} r="5" fill="none" strokeWidth="2" opacity="0" className="stroke-marigold" />
              <circle ref={(el) => void (dots.current[i] = el)} cx={r1(280 + ring.r * Math.cos(a))} cy={r1(280 + ring.r * Math.sin(a))} r={p.size} className="fill-sidebar-foreground" opacity="0.8" />
            </g>
          );
        })}
        <g ref={hand} className="dial-hand" transform="rotate(-90 280 280)">
          <path d="M280 280 L530 280 A250 250 0 0 0 471.2 118.9 Z" className="fill-marigold" opacity="0.12" />
          <line x1="280" y1="280" x2="530" y2="280" strokeWidth="3" strokeLinecap="round" className="stroke-marigold" />
        </g>
        <circle cx="280" cy="280" r="8" className="fill-marigold" />
        <g fontSize="13" className="fill-sidebar-muted">
          {RINGS.map((ring) => (
            <text key={ring.label} x="292" y={280 - ring.r + 8}>{ring.label}</text>
          ))}
        </g>
      </svg>
      <div className="absolute bottom-2 right-2 rounded-md bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground">
        <span ref={counter} className="font-semibold tabular-nums">0</span> invoices issued
      </div>
    </div>
  );
}
