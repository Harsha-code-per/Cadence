import { z } from "zod";
import type { Role } from "@/hooks/useMe";

/** The brief's password rule, mirrored from the backend validator (the server stays authoritative). */
export const PASSWORD_RULES = [
  { id: "length", label: "More than 8 characters", test: (v: string) => v.length > 8 },
  { id: "upper", label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { id: "special", label: "A special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export const emailField = z.string().trim().min(1, "Enter your email.").email("Enter a valid email address, like name@company.com.");

export const newPasswordField = z
  .string()
  .refine((v) => PASSWORD_RULES.every((r) => r.test(v)), "Your password doesn't meet all the rules yet.");

/** Where each role lands after signing in. */
export function homeFor(role: Role) {
  return role === "customer" ? "/portal" : "/dashboard";
}

/**
 * Only same-site paths are allowed as a post-login destination, so ?next= can't bounce
 * a user to a phishing site (open redirect). Anything else falls back to the role's home.
 */
export function safeNext(next: string | null, role: Role) {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    const area = next.startsWith("/portal") ? "customer" : "internal";
    const allowed = role === "customer" ? area === "customer" : area === "internal";
    if (allowed) return next;
  }
  return homeFor(role);
}
