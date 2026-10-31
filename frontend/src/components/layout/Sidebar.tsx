"use client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CycleMark } from "@/components/layout/CycleMark";
import { NAV } from "@/components/layout/nav";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { resolvedTheme, setTheme } = useTheme();
  const qc = useQueryClient();

  async function logout() {
    await api.post("/auth/logout/").catch(() => undefined);
    qc.clear();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops all cached user data
    window.location.assign("/login");
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 py-5 font-display text-lg font-semibold"
        onClick={onNavigate}
      >
        <CycleMark /> Cadence
      </Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => {
          // Until /auth/me/ answers, show everything; the backend enforces roles regardless.
          const items = group.items.filter((i) => !i.roles || !me || i.roles.includes(me.role));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mt-4 first:mt-0">
              <p className="px-2 pb-1 text-xs text-sidebar-foreground/60">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-base transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                          active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        {active && (
                          <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-marigold" />
                        )}
                        <Icon size={18} strokeWidth={1.75} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              />
            }
          >
            <span className="truncate">{me?.full_name ?? "Account"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Switch theme
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              <LogOut size={16} /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[248px] shrink-0 md:block">
      <div className="fixed inset-y-0 w-[248px]">
        <SidebarNav />
      </div>
    </aside>
  );
}
