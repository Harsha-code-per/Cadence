"use client";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { api, ApiError } from "@/lib/api";
import { newPasswordField } from "@/lib/auth";

const schema = z
  .object({ new_password: newPasswordField, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type Values = z.infer<typeof schema>;

export function ResetForm({ uid, token }: { uid: string; token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, control, formState } = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched" });
  const { errors, isSubmitting } = formState;
  const password = useWatch({ control, name: "new_password" }) ?? "";

  async function onSubmit({ new_password }: Values) {
    setFormError(null);
    try {
      await api.post("/auth/password-reset/confirm/", { uid, token, new_password });
      router.replace("/login?reset=done");
    } catch (e) {
      if (applyServerErrors(e, setError)) return;
      setFormError(e instanceof ApiError ? e.message : "We couldn't reach Cadence. Check your connection and try again.");
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You'll be signed out of other devices once it's changed."
      footer={
        <Link href="/forgot-password" className="font-medium text-plum underline-offset-4 hover:underline">
          Need a new link?
        </Link>
      }
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="space-y-2.5">
          <Field label="New password" error={errors.new_password?.message}>
            <PasswordInput autoComplete="new-password" autoFocus aria-invalid={!!errors.new_password} aria-describedby="password-rules" {...register("new_password")} />
          </Field>
          <PasswordChecklist id="password-rules" value={password} />
        </div>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
        </Field>
        <Button type="submit" className="h-11 w-full text-[15px]" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthShell>
  );
}
