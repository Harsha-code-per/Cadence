"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Shield, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PasswordRules } from "@/components/auth/PasswordRules";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { DataTable } from "@/components/data/DataTable";
import { DateText } from "@/components/data/Money";
import { Field, applyServerErrors, errorOf } from "@/components/forms/Field";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { useMe } from "@/hooks/useMe";
import { api, type Paginated } from "@/lib/api";

interface StaffRow {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  is_active: boolean;
  date_joined: string;
}

const staffSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["admin", "staff"]),
  password: z
    .string()
    .min(9, "Must be more than 8 characters.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[^A-Za-z0-9]/, "Add a special character."),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export default function StaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: loadingMe } = useMe();

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  // Security guard: Only admins can view the staff management page
  useEffect(() => {
    if (!loadingMe && me && me.role !== "admin") {
      toast.error("Only administrators can access staff management.");
      router.push("/dashboard");
    }
  }, [me, loadingMe, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get<Paginated<StaffRow>>("/staff/?page_size=50"),
    enabled: me?.role === "admin",
  });

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { full_name: "", email: "", role: "staff", password: "" },
    mode: "onChange",
  });

  const passwordValue = useWatch({ control: form.control, name: "password" }) || "";

  async function handleCreate(values: StaffFormValues) {
    setSubmitting(true);
    try {
      await api.post("/staff/", values);
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member created successfully!");
      setCreateOpen(false);
      form.reset();
    } catch (err: unknown) {
      const mapped = applyServerErrors<StaffFormValues>(err, form.setError);
      if (!mapped && err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivatingId) return;
    try {
      await api.delete(`/staff/${deactivatingId}/`);
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member deactivated.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setDeactivatingId(null);
    }
  }

  const columns: ColumnDef<StaffRow, unknown>[] = [
    {
      accessorKey: "full_name",
      header: "Staff Member",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-ink">{row.original.full_name}</p>
          <p className="text-xs font-mono text-ink-2">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) =>
        row.original.role === "admin" ? (
          <Badge className="gap-1 bg-plum text-white hover:bg-plum">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        ) : (
          <Badge variant="outline" className="border-line text-ink-2">
            Staff
          </Badge>
        ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) =>
        row.original.is_active ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />
            Deactivated
          </span>
        ),
    },
    {
      accessorKey: "date_joined",
      header: "Joined On",
      cell: ({ row }) => (
        <DateText value={row.original.date_joined} className="text-xs text-ink-2" />
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.id !== me?.id && row.original.is_active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeactivatingId(row.original.id)}
            className="text-xs text-rose hover:bg-rose/10 hover:text-rose"
          >
            <UserMinus className="h-3.5 w-3.5 mr-1" />
            Deactivate
          </Button>
        ) : null,
    },
  ];

  if (loadingMe || me?.role !== "admin") {
    return <div className="p-8 text-center text-sm text-ink-2">Verifying permissions…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Directory"
        description="Internal team members with administrative or operational access."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 bg-plum text-white hover:bg-plum/90"
          >
            <Plus className="h-4 w-4" />
            Add staff member
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        count={data?.count ?? 0}
        page={1}
        pageSize={50}
        loading={isLoading}
        onPageChange={() => {}}
      />

      {/* Add Staff Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>
              Create an internal user account with administrative or staff privileges.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            <Field label="Full Name" error={errorOf(form.formState.errors, "full_name")}>
              <Input placeholder="Harsha Vardhan" {...form.register("full_name")} />
            </Field>

            <Field label="Work Email" error={errorOf(form.formState.errors, "email")}>
              <Input
                type="email"
                placeholder="harsha@brightloop.test"
                {...form.register("email")}
              />
            </Field>

            <Field label="Role" error={errorOf(form.formState.errors, "role")}>
              <select
                {...form.register("role")}
                className="h-9 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="staff">Staff (Operational access)</option>
                <option value="admin">Admin (Full system access)</option>
              </select>
            </Field>

            <Field label="Initial Password" error={errorOf(form.formState.errors, "password")}>
              <Input
                type="password"
                placeholder="••••••••••••"
                {...form.register("password")}
              />
            </Field>

            <PasswordRules value={passwordValue} />

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
                {submitting ? "Adding…" : "Add Staff Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={deactivatingId !== null}
        onOpenChange={(open) => !open && setDeactivatingId(null)}
        title="Deactivate staff member?"
        description="This user will no longer be able to log in or access internal records. This action can be reversed by an administrator."
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
