"use client";
import "@/components/landing/landing.css";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LedgerMark } from "@/components/layout/LedgerMark";
import type { LedgerState } from "@/components/landing/Ledger";
import { canUseWebGL } from "@/components/landing/support";

const Ledger = dynamic(() => import("@/components/landing/Ledger"), { ssr: false });

/** The landing page's opening shot, held still: the glass ledger beside a frosted card. */
const scene: LedgerState = { morph: 0, sub: 0, track: 0.5, form: 1 };

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const [three, setThree] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check only exists in the browser
    setThree(canUseWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.innerWidth >= 1024);
  }, []);

  return (
    <div className="landing min-h-svh">
      <div className="stage" aria-hidden="true">
        {three && <Ledger world={scene} />}
      </div>
      <div className="relative z-10 mx-auto flex min-h-svh max-w-[1500px] flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="Cadence home">
          <LedgerMark size={30} />
          <span className="display text-[22px] font-bold">Cadence</span>
        </Link>
        <main className="flex flex-1 items-center py-8">
          <div className="glass w-full max-w-[460px] space-y-7 rounded-3xl p-7 sm:p-9">
            <header className="space-y-2">
              <h1 className="display text-[34px] font-bold leading-tight">{title}</h1>
              {subtitle && <p className="text-[15px] leading-relaxed text-[var(--l-text-2)]">{subtitle}</p>}
            </header>
            {children}
            {footer && <div className="text-sm text-[var(--l-text-2)]">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
