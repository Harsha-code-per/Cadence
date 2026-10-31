"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/useMe";
import { api, ApiError } from "@/lib/api";
import type { components } from "@/lib/api-types";

type Answer = components["schemas"]["AssistantAnswer"];
type Status = components["schemas"]["AssistantStatus"];

export function AskCadence() {
  const { data: me } = useMe();
  const allowed = me?.role === "admin" || me?.role === "staff";
  const status = useQuery({
    queryKey: ["assistant-status", me?.id],
    queryFn: () => api.get<Status>("/assistant/status/"),
    enabled: allowed,
    staleTime: 60_000,
    retry: false,
  });
  const [question, setQuestion] = useState("");
  const answer = useMutation({
    mutationFn: (q: string) => api.get<Answer>("/assistant/ask/", { q }),
    retry: false,
  });

  if (!allowed || !status.data?.enabled) return null;

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.isPending && question.trim()) answer.mutate(question.trim());
  }

  const error = answer.error instanceof ApiError
    ? answer.error.fieldErrors.q?.join(" ") || answer.error.message
    : "Could not reach Ask Cadence. Please try again.";

  return (
    <section aria-labelledby="ask-cadence-title" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="ask-cadence-title" className="font-display text-lg font-semibold text-ink">Ask Cadence</h2>
      <p id="ask-cadence-help" className="mt-1 text-sm text-ink-2">
        Ask about revenue, overdue aging, status counts or pipeline. Answers use aggregate numbers, not customer records.
      </p>
      <form onSubmit={ask} className="mt-4 space-y-2">
        <label htmlFor="cadence-question" className="text-sm font-medium text-ink">Your finance question</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cadence-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="How much is more than 60 days overdue?"
            maxLength={300}
            required
            disabled={answer.isPending}
            aria-describedby={`ask-cadence-help ask-cadence-limit${answer.isError ? " ask-cadence-error" : ""}`}
            aria-invalid={answer.isError}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={answer.isPending || !question.trim()}>
            {answer.isPending ? "Asking…" : "Ask Cadence"}
          </Button>
        </div>
        <p id="ask-cadence-limit" className="text-xs text-ink-2">Up to 300 characters · 10 questions per minute. Do not include personal details.</p>
      </form>
      <div aria-live="polite" aria-busy={answer.isPending}>
        {answer.isPending && <p role="status" className="mt-4 text-sm text-ink-2">Reading the aggregate numbers…</p>}
        {answer.isError && <p id="ask-cadence-error" role="alert" className="mt-4 text-sm text-rose">{error}</p>}
        {answer.isSuccess && (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <p className="whitespace-pre-wrap text-sm text-ink">{answer.data.answer}</p>
            {answer.data.tool && (
              <div>
                <h3 className="text-sm font-medium text-ink">Source numbers · {answer.data.tool.replaceAll("_", " ")}</h3>
                <p className="mt-1 text-xs text-ink-2">Check the answer against these database aggregates. Money is in INR.</p>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-canvas p-3 font-sans text-sm tabular-nums text-ink" tabIndex={0} aria-label="Raw aggregate numbers">
                  {JSON.stringify(answer.data.numbers, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
