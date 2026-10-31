import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard: app and portal pages need a session cookie. Without one we redirect to
 * /login?next=… before rendering anything. This is a UX gate only: every API call is
 * still authorised by Django, and RoleGate sends each role to its own area.
 */
const PROTECTED = ["/dashboard", "/customers", "/subscriptions", "/invoices", "/payments", "/products", "/plans", "/discounts", "/taxes", "/quotation-templates", "/staff", "/settings", "/insights", "/portal"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsSession = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !request.cookies.has("cadence_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
