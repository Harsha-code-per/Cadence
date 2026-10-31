"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { LedgerMark } from "@/components/layout/LedgerMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const WORKSPACE_NAV_ID = "workspace-navigation";

export function SidebarHeader({ collapsed, onToggle, onNavigate }: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const action = collapsed ? "Expand sidebar" : "Collapse sidebar";
  if (!onToggle) {
    return (
      <Link href="/dashboard" onClick={onNavigate} aria-label="Cadence home"
        className="flex h-14 shrink-0 items-center gap-2.5 px-6 font-display text-xl font-bold text-sidebar-accent-foreground">
        <LedgerMark /> Cadence
      </Link>
    );
  }

  return (
    <div className={cn("flex h-14 shrink-0 items-center text-sidebar-accent-foreground", collapsed ? "justify-center" : "justify-between gap-2 px-3")}>
      {!collapsed && (
        <Link href="/dashboard" onClick={onNavigate} aria-label="Cadence home"
          className="flex min-w-0 items-center gap-2 rounded-md pl-2 font-display text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
          <span aria-hidden="true" data-sidebar-mark className="shrink-0"><LedgerMark /></span>
          <span>Cadence</span>
        </Link>
      )}
      <Tooltip>
        <TooltipTrigger render={
          <button type="button" onClick={onToggle} aria-label={action}
            aria-expanded={!collapsed} aria-controls={WORKSPACE_NAV_ID}
            className="group relative flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
            {collapsed ? (
              <>
                <span aria-hidden="true" data-sidebar-mark
                  className="pointer-events-none absolute inset-0 flex items-center justify-center group-hover:opacity-0 group-focus-visible:opacity-0 [@media(hover:none)]:opacity-0">
                  <LedgerMark />
                </span>
                <span aria-hidden="true" data-sidebar-action
                  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                  <PanelLeftOpen size={20} strokeWidth={1.75} />
                </span>
              </>
            ) : <PanelLeftClose aria-hidden="true" data-sidebar-action size={20} strokeWidth={1.75} />}
          </button>
        } />
        <TooltipContent side={collapsed ? "right" : "bottom"} align={collapsed ? "center" : "start"}>{action}</TooltipContent>
      </Tooltip>
    </div>
  );
}
