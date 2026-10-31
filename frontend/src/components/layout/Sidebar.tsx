"use client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { CycleMark } from "@/components/layout/CycleMark";
import { NAV } from "@/components/layout/nav";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const KEY = "cadence.sidebar.collapsed";

const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Collapsed state, remembered per browser. Server renders expanded; the client takes over after hydration. */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    read,
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {}
    listeners.forEach((l) => l());
  };
  return { collapsed, toggle };
}

const row =
  "relative flex items-center rounded-md text-[15px] transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-sidebar-ring";

function Labelled({ label, show, children }: { label: string; show: boolean; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
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

  const initials = (me?.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        aria-label="Cadence home"
        className={cn(
          "flex h-12 shrink-0 items-center gap-2.5 font-display text-xl font-bold text-sidebar-accent-foreground",
          collapsed ? "justify-center" : "px-6",
        )}
      >
        <CycleMark />
        {!collapsed && "Cadence"}
      </Link>

      {/* The scrollbar is hidden and a soft fade marks overflow, so the rail never shows browser chrome. */}
      <nav
        aria-label="Main"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {NAV.map((group, gi) => {
          // Until /auth/me/ answers, show everything; the backend enforces roles regardless.
          const items = group.items.filter((i) => !i.roles || !me || i.roles.includes(me.role));
          if (!items.length) return null;
          return (
            <div key={group.label} className={gi === 0 ? "" : "mt-3"}>
              {collapsed ? (
                gi > 0 && <div aria-hidden className="mx-3 mb-3 border-t border-sidebar-border" />
              ) : (
                <p className="px-3 pb-1.5 text-xs font-medium text-sidebar-muted">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Labelled label={label} show={collapsed}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          aria-label={collapsed ? label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            row,
                            "h-[34px] gap-3",
                            collapsed ? "justify-center" : "px-3",
                            active &&
                              (collapsed
                                ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:-left-2 before:w-[3px] before:rounded-r before:bg-marigold"
                                : "rounded-l-none border-l-[3px] border-marigold bg-sidebar-accent pl-[9px] font-medium text-sidebar-accent-foreground"),
                          )}
                        >
                          <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
                          {!collapsed && <span className="truncate">{label}</span>}
                        </Link>
                      </Labelled>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn("space-y-1 border-t border-sidebar-border py-2", collapsed ? "px-2" : "px-3")}>
        {onToggle && (
          <Labelled label="Expand sidebar" show={collapsed}>
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={cn(row, "h-[34px] w-full gap-3 text-sidebar-muted hover:text-sidebar-accent-foreground", collapsed ? "justify-center" : "px-3")}
            >
              {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
              {!collapsed && "Collapse"}
            </button>
          </Labelled>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                aria-label="Account menu"
                className={cn(row, "w-full gap-2.5 p-2 text-left", collapsed && "justify-center")}
              />
            }
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-plum text-[13px] font-semibold text-primary-foreground">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm leading-tight text-sidebar-accent-foreground">{me?.full_name ?? "Account"}</span>
                <span className="block text-xs capitalize leading-tight text-sidebar-muted">{me?.role ?? ""}</span>
              </span>
            )}
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

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn("hidden shrink-0 transition-[width] duration-[160ms] ease-out md:block", collapsed ? "w-[72px]" : "w-[248px]")}
    >
      <div className={cn("fixed inset-y-0 transition-[width] duration-[160ms] ease-out", collapsed ? "w-[72px]" : "w-[248px]")}>
        <SidebarNav collapsed={collapsed} onToggle={onToggle} />
      </div>
    </aside>
  );
}
