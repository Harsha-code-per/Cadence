"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { CatalogPage } from "@/components/data/CatalogPage";
import type { FieldDef } from "@/components/forms/ResourceDialog";
import type { components } from "@/lib/api-types";

type Customer = components["schemas"]["Customer"];

const columns: ColumnDef<Customer, unknown>[] = [
  {
    accessorKey: "name",
    header: "Customer",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        {row.original.company && <span className="text-xs text-ink-2">{row.original.company}</span>}
      </div>
    ),
  },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "phone", header: "Phone" },
  { accessorKey: "assigned_staff_name", header: "Account manager", cell: ({ row }) => row.original.assigned_staff_name || "Unassigned" },
  {
    id: "portal",
    header: "Portal",
    cell: ({ row }) => (row.original.user ? <span className="text-teal">Has a login</span> : <span className="text-ink-2">Not yet</span>),
  },
];

const fields: FieldDef[] = [
  { name: "name", label: "Contact name", kind: "text", required: true },
  { name: "company", label: "Company", kind: "text" },
  { name: "email", label: "Billing email", kind: "text", required: true, hint: "Invoices and the portal invitation go here." },
  { name: "phone", label: "Phone", kind: "text" },
  { name: "address", label: "Billing address", kind: "textarea" },
];

/** Staff handle customers day to day, so they can add and edit them (admins too). */
export default function CustomersPage() {
  return (
    <CatalogPage<Customer>
      title="Customers"
      description="Everyone Brightloop bills. Customers can claim a portal login with “Forgot password” on their billing email."
      resource="customers"
      noun="Customer"
      columns={columns}
      fields={fields}
      writeRoles={["admin", "staff"]}
    />
  );
}
