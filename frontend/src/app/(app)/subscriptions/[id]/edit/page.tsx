"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/data/Money";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, ApiError, type Paginated } from "@/lib/api";

type Line = {
  id: number;
  product: number;
  product_name: string;
  variant_label: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  amount: string;
};
type Subscription = {
  id: number;
  number: string;
  status: string;
  start_date: string;
  expiration_date: string | null;
  notes: string;
  lines: Line[];
};
type Product = { id: number; name: string };
type Variant = { id: number; label: string };

function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="text-sm text-destructive">
      <p>{error.message}</p>
      {error instanceof ApiError &&
        Object.entries(error.fieldErrors).map(([field, messages]) => (
          <p key={field}>
            {field}: {messages.join(" ")}
          </p>
        ))}
    </div>
  );
}

function DraftFields({ subscription }: { subscription: Subscription }) {
  const client = useQueryClient();
  const [startDate, setStartDate] = useState(subscription.start_date);
  const [endDate, setEndDate] = useState(subscription.expiration_date ?? "");
  const [notes, setNotes] = useState(subscription.notes);
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/subscriptions/${subscription.id}/`, {
        start_date: startDate,
        expiration_date: endDate || null,
        notes,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["subscription", String(subscription.id)] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-surface p-5 sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">Draft details</h2>
      <label className="grid gap-1.5 text-sm font-medium">
        Start date
        <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        End date (optional)
        <Input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
        Notes
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="sm:col-span-2">
        <ErrorMessage error={save.error} />
        {save.isSuccess && (
          <p role="status" className="mb-2 text-sm text-teal">
            Draft details saved.
          </p>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

function EditLine({ subscriptionId, line }: { subscriptionId: string; line: Line }) {
  const client = useQueryClient();
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [price, setPrice] = useState(line.unit_price);
  const [description, setDescription] = useState(line.description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cost = useQuery({
    queryKey: ["product-cost", line.product],
    queryFn: () => api.get<{ cost_price: string }>(`/products/${line.product}/`),
    staleTime: 5 * 60_000,
    select: (product) => product.cost_price,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["subscription", subscriptionId] });
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/subscriptions/${subscriptionId}/lines/${line.id}/`, {
        quantity: Number(quantity),
        unit_price: price,
        description,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/subscriptions/${subscriptionId}/lines/${line.id}/`),
    onSuccess: refresh,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border-t p-5 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <h3 className="font-medium">{line.product_name}</h3>
        {line.variant_label && <p className="text-sm text-ink-2">{line.variant_label}</p>}
        <p className="text-sm text-ink-2">
          Current amount: <Money value={line.amount} />
        </p>
      </div>
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
        Description
        <Input value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Quantity
        <Input type="number" required min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Unit price
        <Input type="number" required min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <div className="sm:col-span-4">
        {cost.data && Number(price) < Number(cost.data) && (
          <p role="status" className="mb-2 text-sm font-medium text-amber">
            This price is below the product&rsquo;s cost of <Money value={cost.data} />, so this line loses money.
          </p>
        )}
        <ErrorMessage error={save.error || remove.error} />
        {save.isSuccess && (
          <p role="status" className="mb-2 text-sm text-teal">
            Line saved.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending || remove.isPending}>
            {save.isPending ? "Saving…" : "Save line"}
          </Button>
          {confirmDelete ? (
            <>
              <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? "Removing…" : "Confirm removal"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={remove.isPending}
              >
                Keep line
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
              Remove line
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function AddLine({ subscriptionId }: { subscriptionId: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [product, setProduct] = useState("");
  const [variant, setVariant] = useState("");
  const [variantPage, setVariantPage] = useState(1);
  const [quantity, setQuantity] = useState("1");
  const products = useQuery({
    queryKey: ["draft-products", page],
    queryFn: () => api.get<Paginated<Product>>("/products/", { page, page_size: 100 }),
  });
  const variants = useQuery({
    queryKey: ["draft-variants", product, variantPage],
    queryFn: () => api.get<Paginated<Variant>>("/variants/", { product, page: variantPage, page_size: 100 }),
    enabled: !!product,
  });
  const add = useMutation({
    mutationFn: () =>
      api.post(`/subscriptions/${subscriptionId}/lines/`, {
        product: Number(product),
        ...(variant ? { variant: Number(variant) } : {}),
        quantity: Number(quantity),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["subscription", subscriptionId] });
      setProduct("");
      setVariant("");
      setVariantPage(1);
      setQuantity("1");
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate();
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-surface p-5 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <h2 className="text-lg font-semibold">Add a line</h2>
        <p className="mt-1 text-sm text-ink-2">
          The product price and default taxes are copied when the line is added.
        </p>
      </div>
      <div className="grid content-start gap-1.5 text-sm font-medium">
        <label htmlFor="line-product">Product</label>
        <select
          id="line-product"
          required
          className="h-9 rounded-md border bg-background px-3 font-normal"
          value={product}
          disabled={products.isLoading || products.isError}
          onChange={(e) => {
            setProduct(e.target.value);
            setVariant("");
            setVariantPage(1);
          }}
        >
          <option value="">Select a product</option>
          {products.data?.results.map((item) => (
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
            disabled={page === 1 || products.isFetching}
            onClick={() => {
              setPage(page - 1);
              setProduct("");
              setVariant("");
              setVariantPage(1);
            }}
          >
            Previous
          </Button>{" "}
          Page {page}{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!products.data?.next || products.isFetching}
            onClick={() => {
              setPage(page + 1);
              setProduct("");
              setVariant("");
              setVariantPage(1);
            }}
          >
            Next
          </Button>
        </span>
      </div>
      <div className="grid content-start gap-1.5 text-sm font-medium">
        <label htmlFor="line-variant">Variant (optional)</label>
        <select
          id="line-variant"
          className="h-9 rounded-md border bg-background px-3 font-normal"
          value={variant}
          disabled={!product || variants.isLoading || variants.isError}
          onChange={(e) => setVariant(e.target.value)}
        >
          <option value="">Default product</option>
          {variants.data?.results.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {product && (
          <span className="flex items-center gap-2 font-normal">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={variantPage === 1 || variants.isFetching}
              onClick={() => {
                setVariantPage(variantPage - 1);
                setVariant("");
              }}
            >
              Previous
            </Button>{" "}
            Page {variantPage}{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!variants.data?.next || variants.isFetching}
              onClick={() => {
                setVariantPage(variantPage + 1);
                setVariant("");
              }}
            >
              Next
            </Button>
          </span>
        )}
      </div>
      <label className="grid content-start gap-1.5 text-sm font-medium">
        Quantity
        <Input type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      {products.isError || variants.isError ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          Could not load products or variants. Refresh to try again.
        </p>
      ) : null}
      <div className="sm:col-span-3">
        <ErrorMessage error={add.error} />
        {add.isSuccess && (
          <p role="status" className="mb-2 text-sm text-teal">
            Line added.
          </p>
        )}
        <Button type="submit" disabled={add.isPending || products.isError || variants.isError || variants.isFetching}>
          {add.isPending ? "Adding…" : "Add line"}
        </Button>
      </div>
    </form>
  );
}

export default function EditSubscriptionPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["subscription", id],
    queryFn: () => api.get<Subscription>(`/subscriptions/${id}/`),
  });
  if (query.isLoading) return <p role="status">Loading subscription…</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert">
        <p>Could not load this subscription.</p>
        <Button variant="link" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  const subscription = query.data;
  return (
    <>
      <Link
        href={`/subscriptions/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ChevronLeft size={16} /> Back to subscription
      </Link>
      <PageHeader title={`Edit ${subscription.number}`} description="Update draft details and subscription lines." />
      {subscription.status !== "draft" ? (
        <p role="alert" className="rounded-lg border bg-surface p-5">
          Only draft subscriptions can be edited. Revise the quotation first if that action is available.
        </p>
      ) : (
        <div className="space-y-6">
          <DraftFields key={subscription.id} subscription={subscription} />
          <section className="overflow-hidden rounded-lg border bg-surface">
            <h2 className="p-5 text-lg font-semibold">Subscription lines</h2>
            {subscription.lines.length ? (
              subscription.lines.map((line) => <EditLine key={line.id} line={line} subscriptionId={id} />)
            ) : (
              <p className="px-5 pb-5 text-sm text-ink-2">No lines yet. Add a product below.</p>
            )}
          </section>
          <AddLine subscriptionId={id} />
        </div>
      )}
    </>
  );
}
