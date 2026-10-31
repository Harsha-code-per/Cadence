"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormAlert } from "@/components/auth/FormAlert";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Field, applyServerErrors } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { api, ApiError } from "@/lib/api";
import { newPasswordField } from "@/lib/auth";

const schema = z
  .object({ old_password: z.string().min(1, "Enter your current password."), new_password: newPasswordField, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type Values = z.infer<typeof schema>;

export function AccountSettings() {
  const { data: me } = useMe();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, control, reset, formState } = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched" });
  const { errors, isSubmitting } = formState;
  const password = useWatch({ control, name: "new_password" }) ?? "";

  async function onSubmit({ old_password, new_password }: Values) {
    setFormError(null);
    try {
      await api.post("/auth/change-password/", { old_password, new_password });
      reset();
      toast.success("Password changed.");
    } catch (e) {
      if (applyServerErrors(e, setError)) return;
      setFormError(e instanceof ApiError ? e.message : "We couldn't reach Cadence. Check your connection and try again.");
    }
  }

  return (
    <div className="grid max-w-4xl items-start gap-5 md:grid-cols-[1fr_1.4fr]">
      <section aria-labelledby="account-heading" className="rounded-lg border bg-surface p-5">
        <h2 id="account-heading" className="font-sans text-[17px] font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-ink-2">Name</dt>
            <dd className="font-medium">{me?.full_name}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Email</dt>
            <dd className="font-medium break-all">{me?.email}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Role</dt>
            <dd className="font-medium capitalize">{me?.role}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="password-heading" className="rounded-lg border bg-surface p-5">
        <h2 id="password-heading" className="font-sans text-[17px] font-semibold">Change password</h2>
        {formError && <div className="mt-4"><FormAlert>{formError}</FormAlert></div>}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
          <Field label="Current password" error={errors.old_password?.message}>
            <PasswordInput autoComplete="current-password" aria-invalid={!!errors.old_password} {...register("old_password")} />
          </Field>
          <div className="space-y-2.5">
            <Field label="New password" error={errors.new_password?.message}>
              <PasswordInput autoComplete="new-password" aria-invalid={!!errors.new_password} aria-describedby="password-rules" {...register("new_password")} />
            </Field>
            <PasswordChecklist id="password-rules" value={password} />
          </div>
          <Field label="Confirm new password" error={errors.confirm?.message}>
            <PasswordInput autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
          </Field>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Change password"}</Button>
        </form>
      </section>
    </div>
  );
}
