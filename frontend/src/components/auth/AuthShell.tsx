"use client";
import "@/components/landing/landing.css";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CycleMark } from "@/components/layout/CycleMark";
import type { CosmosState } from "@/components/landing/Cosmos";
import { canUseWebGL } from "@/components/landing/support";

const Cosmos = dynamic(() => import("@/components/landing/Cosmos"), { ssr: false });

/** The landing page's opening shot, held still: the eclipse behind a frosted card. */
const scene: CosmosState = { morph: 0, sun: 0.17, glow: 0.9 };

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const [cosmos, setCosmos] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check only exists in the browser
    setCosmos(canUseWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="landing dark min-h-svh">
      <div className="cosmos" aria-hidden="true">
        {cosmos && <Cosmos world={scene} density={0.6} />}
      </div>
      <div className="relative z-10 mx-auto flex min-h-svh max-w-[1500px] flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="Cadence home">
          <CycleMark size={30} />
          <span className="display text-[22px] font-bold">Cadence</span>
        </Link>
        <main className="flex flex-1 items-center py-8">
          <div className="glass w-full max-w-[460px] space-y-7 rounded-3xl p-7 shadow-[0_40px_120px_-30px_rgb(15_6_24/0.9)] sm:p-9">
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
