import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isPublicRoute } from "./proxy";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Next.js internal requests, API requests, and static assets pass through
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("cadence_session");
  const isPublic = isPublicRoute(pathname);

  if (!session && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
