"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { DateText, Money } from "@/components/data/Money";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, type Paginated } from "@/lib/api";
import { cn } from "@/lib/utils";

type Subscription = {
  id: number;
  number: string;
  status: string;
  customer: { name: string; company: string };
  plan: { name: string };
  next_invoice_date: string | null;
  recurring_total: string;
};
type Option = { id: number; name: string; company?: string };

const columns: ColumnDef<Subscription, unknown>[] = [
  {
    header: "Subscription",
    cell: ({ row }) => (
      <Link
        className="font-medium text-plum underline-offset-4 hover:underline"
        href={`/subscriptions/${row.original.id}`}
      >
        {row.original.number}
      </Link>
    ),
  },
  { header: "Customer", cell: ({ row }) => row.original.customer.company || row.original.customer.name },
  { header: "Plan", cell: ({ row }) => row.original.plan.name },
  { header: "Status", cell: ({ row }) => <StatusBadge domain="subscription" status={row.original.status} /> },
  { header: "Next invoice", cell: ({ row }) => <DateText value={row.original.next_invoice_date} /> },
  { header: "Recurring", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.recurring_total} /> },
];

function CreateFromTemplate({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const client = useQueryClient();
  const [customer, setCustomer] = useState("");
  const [template, setTemplate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  const customers = useQuery({
    queryKey: ["subscription-customers", customerPage],
    queryFn: () => api.get<Paginated<Option>>("/customers/", { page_size: 100, page: customerPage }),
  });
  const templates = useQuery({
    queryKey: ["subscription-templates", templatePage],
    queryFn: () => api.get<Paginated<Option>>("/quotation-templates/", { page_size: 100, page: templatePage }),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<Subscription>("/subscriptions/from-template/", {
        customer: Number(customer),
        template: Number(template),
        start_date: startDate,
      }),
    onSuccess: async (subscription) => {
      await client.invalidateQueries({ queryKey: ["subscriptions"] });
      router.push(`/subscriptions/${subscription.id}`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }
  const failure = create.error;
  return (
    <section aria-labelledby="create-heading" className="mb-6 rounded-lg border bg-surface p-5">
      <h2 id="create-heading" className="text-lg font-semibold">
        Create from a quotation template
      </h2>
      <p className="mt-1 text-sm text-ink-2">Start a draft using an existing customer and template.</p>
      {customers.isError || templates.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load customers or templates. Please refresh and try again.
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-1.5 text-sm font-medium">
          <label htmlFor="customer">Customer</label>
          <select
            id="customer"
            required
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="h-11 rounded-md border border-input bg-surface px-3 font-normal"
            disabled={customers.isLoading || customers.isError}
          >
            <option value="">Select a customer</option>
            {customers.data?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.company ? `${item.name} · ${item.company}` : item.name}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-2 font-normal">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={customerPage === 1 || customers.isFetching}
              onClick={() => {
                setCustomer("");
                setCustomerPage(customerPage - 1);
              }}
            >
              Previous
            </Button>{" "}
            Page {customerPage}{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!customers.data?.next || customers.isFetching}
              onClick={() => {
                setCustomer("");
                setCustomerPage(customerPage + 1);
              }}
            >
              Next
            </Button>
          </span>
        </div>
        <div className="grid content-start gap-1.5 text-sm font-medium">
          <label htmlFor="template">Quotation template</label>
          <select
            id="template"
            required
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="h-11 rounded-md border border-input bg-surface px-3 font-normal"
            disabled={templates.isLoading || templates.isError}
          >
            <option value="">Select a template</option>
            {templates.data?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-2 font-normal">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={templatePage === 1 || templates.isFetching}
              onClick={() => {
                setTemplate("");
                setTemplatePage(templatePage - 1);
              }}
            >
              Previous
            </Button>{" "}
            Page {templatePage}{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!templates.data?.next || templates.isFetching}
              onClick={() => {
                setTemplate("");
                setTemplatePage(templatePage + 1);
              }}
            >
              Next
            </Button>
          </span>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Start date
          <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        {failure && (
          <div role="alert" className="text-sm text-destructive md:col-span-3">
            <p>{failure.message}</p>
            {failure instanceof ApiError &&
              Object.entries(failure.fieldErrors).map(([field, errors]) => (
                <p key={field}>
                  {field}: {errors.join(" ")}
                </p>
              ))}
          </div>
        )}
        <div className="flex gap-2 md:col-span-3">
          <Button
            type="submit"
            disabled={
              create.isPending || customers.isLoading || templates.isLoading || customers.isError || templates.isError
            }
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

export default function SubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const subscriptions = useQuery({
    queryKey: ["subscriptions", page, search, status],
    queryFn: () => api.get<Paginated<Subscription>>("/subscriptions/", { page, search, status }),
  });
  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Manage your customer subscriptions and their billing schedules."
        actions={
          <Button onClick={() => setCreating(true)} disabled={creating}>
            <Plus /> New subscription
          </Button>
        }
      />
      {creating && <CreateFromTemplate onCancel={() => setCreating(false)} />}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search subscriptions"
          placeholder="Search number or customer"
          className="mr-2 w-full max-w-[280px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {["", "draft", "quotation", "confirmed", "active", "paused", "closed"].map((value) => {
            const on = status === value;
            return (
              <button
                key={value || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  on ? "border-plum bg-plum-soft font-medium text-ink" : "border-line bg-surface text-ink hover:bg-plum-soft/60",
                )}
              >
                {value ? value[0].toUpperCase() + value.slice(1) : "All"}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-sm text-ink-2">
          {subscriptions.data ? `${subscriptions.data.count.toLocaleString("en-IN")} subscriptions` : ""}
        </span>
      </div>
      {subscriptions.isError ? (
        <div role="alert" className="rounded-lg border p-6 text-sm">
          Could not load subscriptions.{" "}
          <Button variant="link" onClick={() => subscriptions.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={subscriptions.data?.results ?? []}
          count={subscriptions.data?.count ?? 0}
          page={page}
          loading={subscriptions.isLoading}
          onPageChange={setPage}
          empty={
            <EmptyState
              message={
                search || status
                  ? "No subscriptions match these filters."
                  : "No subscriptions yet. Create a draft to get started."
              }
            />
          }
        />
      )}
    </>
  );
}
