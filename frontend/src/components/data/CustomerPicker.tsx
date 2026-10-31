"use client";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Input } from "@/components/ui/input";
import { api, type Paginated } from "@/lib/api";

type Customer = { id: number; name: string; company?: string };

/** Find one customer among thousands: search on the server, then pick from the matches. */
export function CustomerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const matches = useQuery({
    queryKey: ["customer-picker", term],
    queryFn: () => api.get<Paginated<Customer>>("/customers/", { search: term, page_size: 25 }),
    placeholderData: (previous) => previous,
  });
  const found = matches.data?.count ?? 0;

  return (
    <div className="grid content-start gap-1.5 text-sm font-medium">
      <label htmlFor="customer-search">Customer</label>
      <Input
        id="customer-search"
        type="search"
        placeholder="Search by name, company or email"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange("");
        }}
      />
      <select
        aria-label="Matching customers"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={matches.isLoading || matches.isError}
        className="h-9 rounded-md border bg-background px-3 font-normal"
      >
        <option value="">{found ? "Select a customer" : "No matching customers"}</option>
        {matches.data?.results.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
            {customer.company ? ` · ${customer.company}` : ""}
          </option>
        ))}
      </select>
      {matches.isError ? (
        <p role="alert" className="font-normal text-destructive">Could not load customers. Please try again.</p>
      ) : found > 25 ? (
        <p className="font-normal text-ink-2">Showing 25 of {found.toLocaleString("en-IN")}. Search to narrow it down.</p>
      ) : null}
    </div>
  );
}
