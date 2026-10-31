"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { errorMessage } from "@/components/invoices/errors";
import { todayInputValue } from "@/components/invoices/format";
import type { BillingRunResult } from "@/components/invoices/types";

function Count({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function RunBillingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [date, setDate] = useState(todayInputValue);
  const [result, setResult] = useState<BillingRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<BillingRunResult>("/billing/run/", { date, dry_run: dryRun }),
    onMutate: () => setError(null),
    onSuccess: (data) => {
      setResult(data);
      void client.invalidateQueries({ queryKey: ["billing-last-run"] });
      if (!data.dry_run) void client.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(
        data.dry_run
          ? `Preview complete — ${data.invoiced} invoice${data.invoiced === 1 ? "" : "s"} would be created`
          : `Billing run complete — ${data.invoiced} invoice${data.invoiced === 1 ? "" : "s"} created`,
      );
    },
    onError: (cause) => setError(errorMessage(cause, "The billing run could not be started.")),
  });

  const dateMissing = !/^\d{4}-\d{2}-\d{2}$/.test(date);
  const canSubmit = !dateMissing && !run.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !run.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!run.isPending}>
        <DialogHeader>
          <DialogTitle>Run billing now</DialogTitle>
          <DialogDescription>
            Bill every subscription that is due as of the chosen date. Preview runs the same code as a dry run and
            changes nothing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="billing-date">Bill as of</Label>
          <Input
            id="billing-date"
            type="date"
            value={date}
            required
            disabled={run.isPending}
            aria-invalid={dateMissing}
            onChange={(event) => setDate(event.target.value)}
          />
          {dateMissing && <p className="text-sm text-destructive">Choose a date to bill as of.</p>}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-lg border bg-surface p-3">
            <p className="text-sm font-medium">
              {result.dry_run ? "Preview only — nothing was billed." : "Billing run finished."}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count label="Invoices" value={result.invoiced} />
              <Count label="Activated" value={result.activated} />
              <Count label="Closed" value={result.closed} />
              <Count label="Skipped" value={result.skipped} />
            </dl>
            {(result.total_billed !== undefined || result.discounts_applied !== undefined) && (
              <p className="mt-2 text-sm text-ink-2">
                {result.total_billed !== undefined && <>Total billed: {result.total_billed}. </>}
                {result.discounts_applied !== undefined && <>Discounts applied: {result.discounts_applied}.</>}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            Close
          </Button>
          <Button variant="outline" onClick={() => run.mutate(true)} disabled={!canSubmit}>
            {run.isPending && run.variables === true ? "Previewing…" : "Preview"}
          </Button>
          <Button onClick={() => run.mutate(false)} disabled={!canSubmit}>
            {run.isPending && run.variables === false ? "Running…" : "Run billing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
