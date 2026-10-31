"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { PasswordRules } from "@/components/auth/PasswordRules";
import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
import { CycleMark } from "@/components/layout/CycleMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const schema = z
  .object({
    new_password: z
      .string()
      .min(9, "Must be more than 8 characters.")
      .regex(/[A-Z]/, "Add an uppercase letter.")
      .regex(/[a-z]/, "Add a lowercase letter.")
      .regex(/[^A-Za-z0-9]/, "Add a special character."),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ uid: string; token: string }>;
}) {
  const { uid, token } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm_password: "" },
    mode: "onChange",
  });

  const passwordValue = useWatch({ control: form.control, name: "new_password" }) || "";

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      await api.post("/auth/password-reset/confirm/", {
        uid,
        token,
        new_password: values.new_password,
      });
      toast.success("Password reset successfully! Please sign in.");
      router.push("/login");
    } catch (err: unknown) {
      const mapped = applyServerErrors<FormValues>(err, form.setError);
      if (!mapped && err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Link href="/" className="mb-3 inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight text-ink">
          <CycleMark size={28} />
          <span>Cadence</span>
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Set new password</h1>
        <p className="mt-1 text-sm text-ink-2">Choose a strong, compliant password.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Field label="New password" error={errorOf(form.formState.errors, "new_password")}>
          <Input
            type="password"
            placeholder="••••••••••••"
            autoComplete="new-password"
            {...form.register("new_password")}
          />
        </Field>

        <PasswordRules value={passwordValue} />

        <Field
          label="Confirm password"
          error={errorOf(form.formState.errors, "confirm_password")}
        >
          <Input
            type="password"
            placeholder="••••••••••••"
            autoComplete="new-password"
            {...form.register("confirm_password")}
          />
        </Field>

        <Button type="submit" disabled={loading} className="w-full bg-plum text-white hover:bg-plum/90">
          {loading ? "Resetting password…" : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
