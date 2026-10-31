"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert } from "@/components/auth/FormAlert";
import { Field, applyServerErrors } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { emailField } from "@/lib/auth";

const schema = z.object({ email: emailField });
type Values = z.infer<typeof schema>;

export function ForgotForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = formState;

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.post("/auth/password-reset/", values);
      setSentTo(values.email);
    } catch (e) {
      if (applyServerErrors(e, setError)) return;
      setFormError(e instanceof ApiError ? e.message : "We couldn't reach Cadence. Check your connection and try again.");
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a secure link. It works once and expires in an hour."
      footer={
        <Link href="/login" className="font-medium text-[var(--l-marigold-text)] underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sentTo ? (
        <FormAlert tone="success">
          If an account exists for <strong className="font-semibold">{sentTo}</strong>, a reset link is on its way. Check your inbox and spam folder.
        </FormAlert>
      ) : (
        <>
          {formError && <FormAlert>{formError}</FormAlert>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="email" autoFocus className="h-11" aria-invalid={!!errors.email} {...register("email")} />
            </Field>
            <Button type="submit" className="h-11 w-full bg-[var(--l-marigold)] text-[15px] font-semibold text-[#2a1730] hover:bg-[#ffd47a]" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
