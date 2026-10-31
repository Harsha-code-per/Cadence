"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
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
import { api, type Paginated } from "@/lib/api";
import { formatMoney } from "@/lib/format";

interface InvoiceOption {
  id: number;
  number: string;
  customer_name: string;
  total: string;
  outstanding: string;
  status: string;
}

const schema = z.object({
  invoice: z.number().min(1, "Please select an invoice."),
  method: z.enum(["upi", "bank_transfer", "card", "cash", "cheque"]),
  amount: z.number().min(0.01, "Amount must be greater than zero."),
  payment_date: z.string().min(1, "Payment date is required."),
  reference: z.string().optional(),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultInvoiceId?: number;
}

export function RecordPaymentDialog({ open, onOpenChange, defaultInvoiceId }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: invoicesData } = useQuery({
    queryKey: ["invoices", "confirmed-for-payment"],
    queryFn: () => api.get<Paginated<InvoiceOption>>("/invoices/?status=confirmed&page_size=50"),
    enabled: open,
  });

  const invoices = invoicesData?.results ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoice: defaultInvoiceId || (invoices[0]?.id ?? 0),
      method: "upi",
      amount: 0,
      payment_date: new Date().toISOString().split("T")[0],
      reference: "",
      note: "",
    },
  });

  const selectedInvoiceId = useWatch({ control: form.control, name: "invoice" });
  const selectedInvoice = invoices.find((inv) => inv.id === Number(selectedInvoiceId));

  // Auto-fill amount with outstanding balance when invoice changes
  const handleInvoiceChange = (invId: number) => {
    form.setValue("invoice", invId);
    const target = invoices.find((inv) => inv.id === invId);
    if (target) {
      form.setValue("amount", parseFloat(target.outstanding || target.total));
    }
  };

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      await api.post("/payments/", {
        ...values,
        amount: values.amount.toFixed(2),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics-revenue-series"] }),
      ]);
      toast.success("Payment recorded successfully!");
      onOpenChange(false);
      form.reset();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record receipt of funds against a confirmed invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Invoice" error={errorOf(form.formState.errors, "invoice")}>
            <select
              value={selectedInvoiceId || ""}
              onChange={(e) => handleInvoiceChange(Number(e.target.value))}
              className="h-9 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Select confirmed invoice...
              </option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} — {inv.customer_name} (Due: {formatMoney(inv.outstanding)})
                </option>
              ))}
            </select>
          </Field>

          {selectedInvoice && (
            <div className="flex justify-between rounded-lg border border-line bg-canvas p-2.5 text-xs">
              <span className="text-ink-2">Outstanding balance:</span>
              <span className="font-semibold text-rose">
                {formatMoney(selectedInvoice.outstanding)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Method" error={errorOf(form.formState.errors, "method")}>
              <select
                {...form.register("method")}
                className="h-9 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </Field>

            <Field label="Amount (₹)" error={errorOf(form.formState.errors, "amount")}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                {...form.register("amount", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Date" error={errorOf(form.formState.errors, "payment_date")}>
              <Input type="date" {...form.register("payment_date")} />
            </Field>

            <Field label="Reference / UTR" error={errorOf(form.formState.errors, "reference")}>
              <Input placeholder="UTR123456" {...form.register("reference")} />
            </Field>
          </div>

          <Field label="Note (optional)" error={errorOf(form.formState.errors, "note")}>
            <Input placeholder="Additional payment details" {...form.register("note")} />
          </Field>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-plum text-white hover:bg-plum/90"
            >
              {loading ? "Recording…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
