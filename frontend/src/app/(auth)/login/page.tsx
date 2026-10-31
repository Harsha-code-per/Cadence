"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
import { CycleMark } from "@/components/layout/CycleMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Me } from "@/hooks/useMe";
import { api } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const user = await api.post<Me>("/auth/login/", values);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Welcome back!");

      const next = searchParams.get("next");
      if (next && !next.startsWith("/login")) {
        router.push(next);
      } else if (user.role === "customer") {
        router.push("/portal");
      } else {
        router.push("/dashboard");
      }
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
        <h1 className="font-display text-2xl font-bold text-ink">Sign in to your account</h1>
        <p className="mt-1 text-sm text-ink-2">Recurring revenue, kept in time.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Email" error={errorOf(form.formState.errors, "email")}>
          <Input
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            {...form.register("email")}
          />
        </Field>

        <Field label="Password" error={errorOf(form.formState.errors, "password")}>
          <Input
            type="password"
            placeholder="••••••••••••"
            autoComplete="current-password"
            {...form.register("password")}
          />
        </Field>

        <div className="flex items-center justify-end text-xs">
          <Link href="/forgot-password" className="text-plum hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-plum text-white hover:bg-plum/90">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-ink-2">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-plum hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
