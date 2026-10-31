"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";

import { RoleGate } from "@/components/auth/RoleGate";
import { CycleMark } from "@/components/layout/CycleMark";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/api";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me } = useMe();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout/");
      toast.success("Signed out");
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <RoleGate allow={["customer"]}>
      <div className="min-h-screen bg-canvas">
        {/* Portal Top Bar */}
        <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/portal" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
              <CycleMark size={24} />
              <span>Cadence</span>
              <span className="rounded bg-plum/10 px-1.5 py-0.5 text-[10px] font-semibold text-plum uppercase tracking-wider">
                Portal
              </span>
            </Link>

            <div className="flex items-center gap-4">
              {me && (
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-line/60 text-ink">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="hidden font-medium sm:inline">{me.full_name}</span>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-xs text-ink-2 hover:text-ink"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</main>
      </div>
    </RoleGate>
  );
}
