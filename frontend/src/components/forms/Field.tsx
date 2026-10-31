"use client";
import type { FieldErrors as RhfErrors, FieldValues, UseFormSetError, Path } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";

/** Label + control + inline error. Pass the control as children. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-ink-2">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}

export const errorOf = <T extends FieldValues>(errors: RhfErrors<T>, name: string) =>
  (errors as Record<string, { message?: string } | undefined>)[name]?.message;

/** Map the API's field_errors onto react-hook-form fields. Returns true if anything was mapped. */
export function applyServerErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>) {
  if (!(e instanceof ApiError)) return false;
  let mapped = false;
  for (const [field, msgs] of Object.entries(e.fieldErrors)) {
    setError(field as Path<T>, { message: msgs[0] });
    mapped = true;
  }
  return mapped;
}
