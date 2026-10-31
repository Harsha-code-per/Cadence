"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { DateText } from "@/components/data/Money";
import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { useUrlState } from "@/hooks/useUrlState";
import { api, type Paginated } from "@/lib/api";

interface CustomerRow {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  assigned_staff_name: string | null;
  created_at: string;
}

const customerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  company: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

function CustomersContent() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { get, set } = useUrlState();

  const search = get("search") ?? "";
  const page = parseInt(get("page") ?? "1", 10);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", { search, page }],
    queryFn: () =>
      api.get<Paginated<CustomerRow>>("/customers/", {
        search,
        page,
        page_size: 20,
      }),
  });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: "", company: "", email: "", phone: "", address: "" },
  });

  async function handleCreate(values: CustomerFormValues) {
    setSubmitting(true);
    try {
      await api.post("/customers/", values);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created successfully!");
      setCreateOpen(false);
      form.reset();
    } catch (err: unknown) {
      const mapped = applyServerErrors<CustomerFormValues>(err, form.setError);
      if (!mapped && err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ColumnDef<CustomerRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-ink">{row.original.name}</p>
          {row.original.company && (
            <p className="text-xs text-ink-2">{row.original.company}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-xs font-mono text-ink-2">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-xs text-ink-3">{row.original.phone || "—"}</span>
      ),
    },
    {
      accessorKey: "assigned_staff_name",
      header: "Account Manager",
      cell: ({ row }) =>
        row.original.assigned_staff_name ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            <UserCheck className="h-3 w-3 text-teal" />
            {row.original.assigned_staff_name}
          </span>
        ) : (
          <span className="text-xs text-ink-3">Unassigned</span>
        ),
    },
    {
      accessorKey: "created_at",
      header: "Added On",
      cell: ({ row }) => (
        <DateText value={row.original.created_at} className="text-xs text-ink-2" />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Client directory, contact details, and account associations."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 bg-plum text-white hover:bg-plum/90"
          >
            <Plus className="h-4 w-4" />
            New customer
          </Button>
        }
      />

      <FilterBar placeholder="Search customer name, company, or email..." />

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        count={data?.count ?? 0}
        page={page}
        pageSize={20}
        loading={isLoading}
        onPageChange={(p) => set({ page: p })}
        empty={
          <EmptyState
            message="No customers found. Add your first customer to start quoting and issuing recurring subscriptions."
            action={
              <Button
                onClick={() => setCreateOpen(true)}
                className="gap-1.5 bg-plum text-white hover:bg-plum/90"
              >
                <Plus className="h-4 w-4" />
                New customer
              </Button>
            }
          />
        }
      />

      {/* New Customer Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
            <DialogDescription>
              Add contact person and billing details.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            <Field label="Contact Person" error={errorOf(form.formState.errors, "name")}>
              <Input placeholder="Asha Rao" {...form.register("name")} />
            </Field>

            <Field label="Company Name" error={errorOf(form.formState.errors, "company")}>
              <Input placeholder="Rao Traders" {...form.register("company")} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" error={errorOf(form.formState.errors, "email")}>
                <Input
                  type="email"
                  placeholder="asha@raotraders.test"
                  {...form.register("email")}
                />
              </Field>

              <Field label="Phone" error={errorOf(form.formState.errors, "phone")}>
                <Input placeholder="+91 98765 43210" {...form.register("phone")} />
              </Field>
            </div>

            <Field label="Billing Address" error={errorOf(form.formState.errors, "address")}>
              <Input
                placeholder="42 Commercial Street, Bangalore"
                {...form.register("address")}
              />
            </Field>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-plum text-white hover:bg-plum/90"
              >
                {submitting ? "Saving…" : "Create Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersContent />
    </Suspense>
  );
}
