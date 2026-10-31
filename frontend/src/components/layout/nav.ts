import {
  Banknote,
  Boxes,
  FileText,
  Layers,
  LayoutDashboard,
  Percent,
  Receipt,
  RefreshCw,
  Settings,
  Sparkles,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import type { Role } from "@/hooks/useMe";

export type NavItem = { href: string; label: string; icon: typeof Users; roles?: Role[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/subscriptions", label: "Subscriptions", icon: RefreshCw },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/payments", label: "Payments", icon: Banknote },
      { href: "/insights", label: "Insights", icon: Sparkles },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/products", label: "Products", icon: Boxes },
      { href: "/plans", label: "Plans", icon: Layers },
      { href: "/discounts", label: "Discounts", icon: Tags, roles: ["admin"] },
      { href: "/taxes", label: "Taxes", icon: Percent },
      { href: "/quotation-templates", label: "Quotation templates", icon: FileText },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/staff", label: "Staff", icon: UserCog, roles: ["admin"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
];
