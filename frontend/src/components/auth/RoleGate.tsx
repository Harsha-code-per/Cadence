"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DemoBanner } from "@/components/auth/DemoBanner";
import { useMe, type Role } from "@/hooks/useMe";
import { ApiError } from "@/lib/api";
import { homeFor } from "@/lib/auth";

/**
 * Keeps each role in its own area: customers in /portal, admin and staff in the app.
 * An expired session (401) goes back to login. The API enforces all of this as well;
 * this just avoids showing screens the user can't use.
 */
export function RoleGate({ allow, children, nested = false }: { allow: Role[]; children: React.ReactNode; nested?: boolean }) {
  const router = useRouter();
  const { data: me, error, isPending } = useMe();
  const expired = error instanceof ApiError && error.status === 401;
  const misplaced = !!me && !allow.includes(me.role);

  useEffect(() => {
    if (expired) router.replace(`/login?expired=1&next=${encodeURIComponent(location.pathname)}`);
    else if (misplaced) router.replace(homeFor(me.role));
  }, [expired, misplaced, me, router]);

  if (isPending || expired || misplaced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas" aria-busy="true" aria-live="polite">
        <span className="sr-only">Checking your session…</span>
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      </div>
    );
  }
  return (
    <>
      {me?.is_demo && !nested && <DemoBanner />}
      {children}
    </>
  );
}
