"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { PasswordRules } from "@/components/auth/PasswordRules";
import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
import { CycleMark } from "@/components/layout/CycleMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Me } from "@/hooks/useMe";
import { api } from "@/lib/api";

const schema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters."),
  company: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(9, "Must be more than 8 characters.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[^A-Za-z0-9]/, "Add a special character."),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", company: "", email: "", password: "" },
    mode: "onChange",
  });

  const passwordValue = useWatch({ control: form.control, name: "password" }) || "";

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      await api.post<Me>("/auth/signup/", values);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Account created successfully!");
      router.push("/portal");
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
        <h1 className="font-display text-2xl font-bold text-ink">Create an account</h1>
        <p className="mt-1 text-sm text-ink-2">Get started with your subscriptions portal.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Full name" error={errorOf(form.formState.errors, "full_name")}>
          <Input
            placeholder="Asha Rao"
            autoComplete="name"
            {...form.register("full_name")}
          />
        </Field>

        <Field label="Company (optional)" error={errorOf(form.formState.errors, "company")}>
          <Input
            placeholder="Rao Traders"
            autoComplete="organization"
            {...form.register("company")}
          />
        </Field>

        <Field label="Work email" error={errorOf(form.formState.errors, "email")}>
          <Input
            type="email"
            placeholder="asha@raotraders.test"
            autoComplete="email"
            {...form.register("email")}
          />
        </Field>

        <Field label="Password" error={errorOf(form.formState.errors, "password")}>
          <Input
            type="password"
            placeholder="••••••••••••"
            autoComplete="new-password"
            {...form.register("password")}
          />
        </Field>

        <PasswordRules value={passwordValue} />

        <Button type="submit" disabled={loading} className="w-full bg-plum text-white hover:bg-plum/90">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-plum hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
