export type UserRole = "admin" | "staff" | "customer";

export interface GuardUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  customer_id?: number | null;
}

export function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/reset-password")
  ) {
    return true;
  }
  return false;
}

export function isAdminOnlyRoute(pathname: string): boolean {
  return pathname === "/staff" || pathname.startsWith("/staff/");
}

export function isPortalRoute(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

export function getRedirectDestination(user: GuardUser | null, pathname: string): string | null {
  const isPublic = isPublicRoute(pathname);

  // Unauthenticated user
  if (!user) {
    if (isPublic) return null;
    return `/login?next=${encodeURIComponent(pathname)}`;
  }

  // Customer role: restricted to /portal only
  if (user.role === "customer") {
    if (isPortalRoute(pathname)) return null;
    return "/portal";
  }

  // Internal users (admin and staff):
  // Should not visit customer portal or public auth pages when logged in
  if (isPublic || isPortalRoute(pathname)) {
    return "/dashboard";
  }

  // Staff role cannot access Admin-only routes
  if (user.role === "staff" && isAdminOnlyRoute(pathname)) {
    return "/dashboard";
  }

  return null;
}
