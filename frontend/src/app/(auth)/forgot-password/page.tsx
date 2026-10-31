"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Field, errorOf } from "@/components/forms/Field";
import { CycleMark } from "@/components/layout/CycleMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      await api.post("/auth/password-reset/", values);
      setSubmitted(true);
      toast.success("Instructions sent");
    } catch (err: unknown) {
      if (err instanceof Error) {
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
        <h1 className="font-display text-2xl font-bold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-2">
          {submitted
            ? "Check your inbox for a reset link"
            : "Enter your email and we'll send you a recovery link"}
        </p>
      </div>

      {submitted ? (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-teal">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm text-ink-2">
            If an account exists with <strong className="text-ink">{form.getValues("email")}</strong>, we have sent a secure password reset link. The link expires in 1 hour.
          </p>
          <Link
            href="/login"
            className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium text-ink hover:bg-canvas transition-colors"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Email" error={errorOf(form.formState.errors, "email")}>
            <Input
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              {...form.register("email")}
            />
          </Field>

          <Button type="submit" disabled={loading} className="w-full bg-plum text-white hover:bg-plum/90">
            {loading ? "Sending reset link…" : "Send reset link"}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
