"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert } from "@/components/auth/FormAlert";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field, applyServerErrors } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Me } from "@/hooks/useMe";
import { api, ApiError } from "@/lib/api";
import { emailField, homeFor, newPasswordField } from "@/lib/auth";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name."),
    company: z.string().trim().max(200).optional(),
    email: emailField,
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, control, formState } = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched" });
  const { errors, isSubmitting } = formState;
  const password = useWatch({ control, name: "password" }) ?? "";

  async function onSubmit(form: Values) {
    const { full_name, company, email, password } = form;
    const values = { full_name, company, email, password };
    setFormError(null);
    try {
      const me = await api.post<Me>("/auth/signup/", values);
      qc.setQueryData(["me"], me);
      router.replace(homeFor(me.role));
    } catch (e) {
      if (applyServerErrors(e, setError)) return;
      setFormError(e instanceof ApiError ? e.message : "We couldn't reach Cadence. Check your connection and try again.");
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="See your plans, invoices and payments in one place, without emailing anyone."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--l-marigold-text)] underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" error={errors.full_name?.message}>
            <Input autoComplete="name" autoFocus className="h-11" aria-invalid={!!errors.full_name} {...register("full_name")} />
          </Field>
          <Field label="Company (optional)" error={errors.company?.message}>
            <Input autoComplete="organization" className="h-11" {...register("company")} />
          </Field>
        </div>
        <Field label="Work email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" className="h-11" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <div className="space-y-2.5">
          <Field label="Password" error={errors.password?.message}>
            <PasswordInput autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="password-rules" {...register("password")} />
          </Field>
          <PasswordChecklist id="password-rules" value={password} />
        </div>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
        </Field>
        <Button type="submit" className="h-11 w-full bg-[var(--l-marigold)] text-[15px] font-semibold text-[#2a1730] hover:bg-[#ffd47a]" disabled={isSubmitting}>
          {isSubmitting ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
