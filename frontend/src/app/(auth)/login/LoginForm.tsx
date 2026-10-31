"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { DemoLogins } from "@/components/auth/DemoLogins";
import { FormAlert } from "@/components/auth/FormAlert";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field, applyServerErrors } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Me } from "@/hooks/useMe";
import { api, ApiError } from "@/lib/api";
import { emailField, safeNext } from "@/lib/auth";

const schema = z.object({ email: emailField, password: z.string().min(1, "Enter your password.") });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setValue, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = formState;

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const me = await api.post<Me>("/auth/login/", values);
      qc.setQueryData(["me"], me);
      router.replace(safeNext(params.get("next"), me.role));
    } catch (e) {
      if (applyServerErrors(e, setError)) return;
      setFormError(e instanceof ApiError ? e.message : "We couldn't reach Cadence. Check your connection and try again.");
    }
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back. Pick up where your billing left off."
      footer={
        <>
          New to Cadence?{" "}
          <Link href="/signup" className="font-medium text-[var(--l-mint-text)] underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {params.get("reset") === "done" && <FormAlert tone="success">Password updated. Log in with your new password.</FormAlert>}
      {params.get("expired") === "1" && <FormAlert>Your session ended. Log in again to continue.</FormAlert>}
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus className="h-11" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <div className="space-y-1.5">
          <Field label="Password" error={errors.password?.message}>
            <PasswordInput autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
          </Field>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-medium text-[var(--l-mint-text)] underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="h-11 w-full bg-[var(--l-mint)] text-[15px] font-semibold text-[#2a1730] hover:bg-[#ffd47a]" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
      <DemoLogins
        onUse={(email, password) => {
          setValue("email", email, { shouldValidate: true });
          setValue("password", password, { shouldValidate: true });
          void handleSubmit(onSubmit)();
        }}
      />
    </AuthShell>
  );
}
