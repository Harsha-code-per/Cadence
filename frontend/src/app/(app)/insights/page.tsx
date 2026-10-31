"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

interface InsightItem {
  subscription_id: number;
  number: string;
  customer_name: string;
  plan_name: string;
  risk_score: number;
  reasons: string[];
}

export default function InsightsPage() {
  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["analytics-insights"],
    queryFn: () => api.get<InsightItem[]>("/analytics/insights/"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk & Retention Insights"
        description="Explainable, rule-based indicators identifying subscriptions at risk of churn or non-payment."
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10 text-teal">
            <CheckCircle className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-ink">Zero at-risk subscriptions</h2>
          <p className="mt-1 text-sm text-ink-2">
            No overdue accounts, recent pause events, or impending expirations detected.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((item) => {
            const isHigh = item.risk_score >= 60;
            const isMedium = item.risk_score >= 30;

            return (
              <div
                key={item.subscription_id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/subscriptions/${item.subscription_id}`}
                      className="font-mono text-base font-bold text-ink hover:text-brand hover:underline"
                    >
                      {item.number}
                    </Link>
                    <span className="text-xs text-ink-3">•</span>
                    <span className="text-sm font-semibold text-ink">{item.customer_name}</span>
                    <Badge variant="outline" className="text-xs text-ink-2">
                      {item.plan_name}
                    </Badge>
                    <Badge
                      className={`gap-1 font-semibold ${
                        isHigh
                          ? "bg-rose/10 text-rose hover:bg-rose/20"
                          : isMedium
                            ? "bg-amber/10 text-amber hover:bg-amber/20"
                            : "bg-teal/10 text-teal hover:bg-teal/20"
                      }`}
                    >
                      {isHigh ? (
                        <ShieldAlert className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      Risk Score: {item.risk_score}/100
                    </Badge>
                  </div>

                  <ul className="space-y-1 text-xs text-ink-2">
                    {item.reasons.map((r, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-rose" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="shrink-0">
                  <Link
                    href={`/subscriptions/${item.subscription_id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand hover:text-white transition-colors"
                  >
                    View subscription
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
