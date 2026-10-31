"use client";
import { Menu } from "lucide-react";
import { Suspense, useState, useSyncExternalStore } from "react";
import { Sidebar, SidebarNav, useSidebarCollapsed } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { serverTiming } from "@/lib/api";

function ServerTiming() {
  const timing = useSyncExternalStore(serverTiming.subscribe, serverTiming.get, () => "");
  return timing ? <span title="Time the server took for the last request">Server {timing}</span> : null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-[var(--shadow-float)]">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-surface px-4 py-2 md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={18} />
          </Button>
          <span className="font-display font-semibold">Cadence</span>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[248px] p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">
          <Suspense>{children}</Suspense>
        </main>
        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-4 text-right text-xs tabular-nums text-ink-2 md:px-6">
          <ServerTiming />
        </footer>
      </div>
    </div>
  );
}
