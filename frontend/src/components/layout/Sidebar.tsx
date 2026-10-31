"use client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CycleMark } from "@/components/layout/CycleMark";
import { NAV } from "@/components/layout/nav";
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
        className="flex items-center gap-2.5 px-6 pb-5 pt-6 font-display text-xl font-bold text-sidebar-accent-foreground"
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
              <p className="px-3 pb-1 pt-2 text-xs text-sidebar-muted">{group.label}</p>
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
                          "relative flex items-center gap-3 rounded-md px-3 py-[9px] text-base transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                          active && "rounded-l-none border-l-[3px] border-marigold bg-sidebar-accent pl-[9px] font-medium text-sidebar-accent-foreground",
                        )}
                      >
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
              <button className="flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-sidebar-ring" />
            }
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-plum text-[13px] font-semibold text-white">
              {(me?.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-sidebar-accent-foreground">{me?.full_name ?? "Account"}</span>
              <span className="block text-xs capitalize text-sidebar-muted">{me?.role ?? ""}</span>
            </span>
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
