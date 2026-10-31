"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { api } from "@/lib/api";

type Invoice = { id: number; number: string };

export function InvoiceNow({ subscriptionId, status }: { subscriptionId: string; status: string }) {
  const { data: me } = useMe();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const invoice = useMutation({
    mutationFn: () => api.post<Invoice>(`/subscriptions/${subscriptionId}/invoice-now/`),
    onSuccess: async () => {
      setConfirming(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["subscription", subscriptionId] }),
        client.invalidateQueries({ queryKey: ["subscriptions"] }),
        client.invalidateQueries({ queryKey: ["invoices"] }),
      ]);
    },
  });
  if ((me?.role !== "admin" && me?.role !== "staff") || status !== "active") return null;
  return (
    <section className="mb-6 rounded-lg border bg-surface p-5" aria-labelledby="invoice-now-heading">
      <h2 id="invoice-now-heading" className="font-semibold">
        Invoice this subscription
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Create an invoice for one due billing period. Future periods cannot be invoiced early.
      </p>
      {invoice.data && (
        <p role="status" className="mt-3 text-sm">
          Invoice {invoice.data.number} was created.{" "}
          <Link href={`/invoices/${invoice.data.id}`} className="text-brand underline">
            View invoice
          </Link>
        </p>
      )}
      {invoice.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {invoice.error.message}
        </p>
      )}
      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-sm">Create the invoice for the next due period?</p>
          <Button disabled={invoice.isPending} onClick={() => invoice.mutate()}>
            {invoice.isPending ? "Creating…" : "Confirm invoice"}
          </Button>
          <Button variant="outline" disabled={invoice.isPending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            invoice.reset();
            setConfirming(true);
          }}
        >
          Invoice due period
        </Button>
      )}
    </section>
  );
}
