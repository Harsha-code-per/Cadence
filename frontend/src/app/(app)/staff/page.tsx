"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { RoleGate } from "@/components/auth/RoleGate";
import { CatalogPage } from "@/components/data/CatalogPage";
import { ActiveBadge } from "@/components/data/StatusBadge";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import type { components } from "@/lib/api-types";
import { PASSWORD_RULES } from "@/lib/auth";

type Staff = components["schemas"]["User"];

const columns: ColumnDef<Staff, unknown>[] = [
  { accessorKey: "full_name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "role", header: "Role", cell: ({ row }) => <span className="capitalize">{row.original.role}</span> },
  { accessorKey: "is_active", header: "Status", cell: ({ row }) => <ActiveBadge active={!!row.original.is_active} /> },
];

const fields: FieldDef[] = [
  { name: "full_name", label: "Full name", kind: "text", required: true },
  { name: "email", label: "Work email", kind: "text", required: true, hint: "Can't be changed later." },
  {
    name: "role",
    label: "Role",
    kind: "select",
    required: true,
    options: [
      { value: "staff", label: "Staff: day-to-day work, no settings" },
      { value: "admin", label: "Admin: full control" },
    ],
  },
  {
    name: "password",
    label: "Temporary password",
    kind: "custom",
    hint: `Only needed when adding someone. ${PASSWORD_RULES.map((r) => r.label.toLowerCase()).join(", ")}. They can change it after logging in.`,
    render: (value, onChange) => (
      <PasswordInput autoComplete="new-password" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
    ),
  },
  { name: "is_active", label: "Can log in", kind: "checkbox" },
];

/** Brief: "Only the admin can add a new member of staff." The page is admin-only in the nav and the API. */
export default function StaffPage() {
  return (
    <RoleGate allow={["admin"]} nested>
    <CatalogPage<Staff>
      title="Staff"
      description="People who run Brightloop's day-to-day billing. Only admins can add or change them."
      resource="staff"
      noun="Staff member"
      columns={columns}
      fields={fields}
      deleteLabel="Deactivate"
      toInitial={(u) => ({ full_name: u.full_name, email: u.email, role: u.role, is_active: u.is_active, password: "" })}
    />
    </RoleGate>
  );
}
