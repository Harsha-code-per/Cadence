"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { CustomerPicker } from "@/components/data/CustomerPicker";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, type Paginated } from "@/lib/api";

type Option = { id: number; name: string; company?: string };

function Picker({
  label,
  path,
  value,
  onChange,
  available,
}: {
  label: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  available?: boolean;
}) {
  const [page, setPage] = useState(1);
  const options = useQuery({
    queryKey: ["draft-create-options", path, page, available],
    queryFn: () => api.get<Paginated<Option>>(path, { page, page_size: 100, available: available || undefined }),
  });
  const fieldId = `picker-${path.replaceAll("/", "")}`;
  const turnPage = (newPage: number) => {
    onChange("");
    setPage(newPage);
  };
  return (
    <div className="grid content-start gap-1.5 text-sm font-medium">
      <label htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={options.isLoading || options.isError}
        className="h-9 rounded-md border bg-background px-3 font-normal"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.data?.results.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.company ? ` · ${item.company}` : ""}
          </option>
        ))}
      </select>
      {options.isError ? (
        <div role="alert" className="font-normal text-destructive">
          Could not load {label.toLowerCase()} options.{" "}
          <Button type="button" variant="link" onClick={() => options.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {!options.isLoading && !options.isError && options.data?.results.length === 0 && (
        <p className="font-normal text-ink-2">No options available.</p>
      )}
      {(page > 1 || options.data?.next) && (
      <div className="flex items-center gap-2 font-normal">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 1 || options.isFetching}
          onClick={() => turnPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!options.data?.next || options.isFetching}
          onClick={() => turnPage(page + 1)}
        >
          Next
        </Button>
      </div>
      )}
    </div>
  );
}

export default function CreateSubscriptionPage() {
  const router = useRouter();
  const client = useQueryClient();
  const [customer, setCustomer] = useState("");
  const [plan, setPlan] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: number }>("/subscriptions/", {
        customer: Number(customer),
        plan: Number(plan),
        payment_term: Number(paymentTerm),
        start_date: startDate,
        expiration_date: endDate || null,
        notes,
      }),
    onSuccess: async (subscription) => {
      await client.invalidateQueries({ queryKey: ["subscriptions"] });
      router.push(`/subscriptions/${subscription.id}/edit`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (customer && plan && paymentTerm && startDate) create.mutate();
  }
  return (
    <>
      <Link href="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline">
        <ChevronLeft size={16} /> Subscriptions
      </Link>
      <PageHeader title="New subscription" description="Create a draft without a quotation template." />
      <form onSubmit={submit} className="grid max-w-4xl gap-5 rounded-lg border bg-surface p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="text-lg font-semibold">Subscription details</h2>
          <p className="mt-1 text-sm text-ink-2">
            After creating the draft, add product lines before sending the quotation.
          </p>
        </div>
        <CustomerPicker value={customer} onChange={setCustomer} />
        <Picker label="Plan" path="/plans/" value={plan} onChange={setPlan} available />
        <Picker label="Payment term" path="/payment-terms/" value={paymentTerm} onChange={setPaymentTerm} />
        <label className="grid content-start gap-1.5 text-sm font-medium">
          Start date
          <Input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="grid content-start gap-1.5 text-sm font-medium">
          End date (optional)
          <Input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          Notes (optional)
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {create.error && (
          <div role="alert" className="text-sm text-destructive sm:col-span-2">
            <p>{create.error.message}</p>
            {create.error instanceof ApiError &&
              Object.entries(create.error.fieldErrors).map(([field, errors]) => (
                <p key={field}>
                  {field}: {errors.join(" ")}
                </p>
              ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={create.isPending || !customer || !plan || !paymentTerm || !startDate}>
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
          <Link href="/subscriptions" className="text-sm text-brand hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
