"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/data/ConfirmDialog";
import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { FilterBar } from "@/components/data/FilterBar";
import { ResourceDialog, type FieldDef } from "@/components/forms/ResourceDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useMe, type Role } from "@/hooks/useMe";
import { useUrlState } from "@/hooks/useUrlState";
import { ApiError } from "@/lib/api";
import { useList, useRemove, useSave } from "@/lib/crud";

type Row = { id: number; name?: string; full_name?: string };
const labelOf = (r: Row | null | undefined) => r?.name ?? r?.full_name;

/** List + create/edit/delete for one resource. Writes default to admins (the API enforces roles too). */
export function CatalogPage<T extends Row>({
  title,
  description,
  resource,
  noun,
  columns,
  fields,
  filters,
  extraParams,
  toInitial,
  rowActions,
  headerActions,
  writeRoles = ["admin"],
  deleteLabel,
}: {
  title: string;
  description?: string;
  resource: string;
  noun: string;
  columns: ColumnDef<T, unknown>[];
  fields: FieldDef[];
  filters?: React.ReactNode;
  extraParams?: Record<string, string | undefined>;
  toInitial?: (row: T) => Record<string, unknown>;
  rowActions?: (row: T) => React.ReactNode;
  headerActions?: React.ReactNode;
  /** Roles that may create/edit/delete. */
  writeRoles?: Role[];
  /** Overrides the delete wording, e.g. "Deactivate". */
  deleteLabel?: string;
}) {
  const url = useUrlState();
  const { data: me } = useMe();
  const canWrite = !!me && writeRoles.includes(me.role);
  const params = { page: url.page, search: url.get("search") || undefined, ...extraParams };
  const list = useList<T>(resource, params);
  const save = useSave<T>(resource, noun);
  const remove = useRemove(resource, noun);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const cols = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      canWrite || rowActions
        ? [
            ...columns,
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { align: "right" },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  {rowActions?.(row.original)}
                  {canWrite && (<>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${labelOf(row.original)}`} onClick={() => setEditing(row.original)}>
                    <Pencil size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${deleteLabel ?? "Delete"} ${labelOf(row.original)}`} onClick={() => setDeleting(row.original)}>
                    <Trash2 size={16} />
                  </Button>
                  </>)}
                </div>
              ),
            },
          ]
        : columns,
    [columns, canWrite, rowActions, deleteLabel],
  );

  const create = (
    <Button onClick={() => setEditing("new")}>
      <Plus size={16} /> New {noun.toLowerCase()}
    </Button>
  );
  const isNew = editing === "new";

  return (
    <>
      <PageHeader title={title} description={description} actions={<>{headerActions}{canWrite ? create : null}</>} />
      <FilterBar placeholder={`Search ${title.toLowerCase()}`}>{filters}</FilterBar>
      {list.isError ? (
        <EmptyState message={list.error instanceof ApiError ? list.error.message : "Could not load this list."} action={<Button variant="outline" onClick={() => list.refetch()}>Try again</Button>} />
      ) : (
        <DataTable
          columns={cols}
          data={list.data?.results ?? []}
          count={list.data?.count ?? 0}
          page={url.page}
          loading={list.isLoading}
          onPageChange={(page) => url.set({ page })}
          empty={
            <EmptyState
              message={url.get("search") ? `No ${title.toLowerCase()} match “${url.get("search")}”.` : `No ${title.toLowerCase()} yet.`}
              action={canWrite && !url.get("search") ? create : undefined}
            />
          }
        />
      )}
      <ResourceDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={isNew ? `New ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`}
        fields={fields}
        initial={editing && !isNew ? (toInitial ? toInitial(editing as T) : (editing as unknown as Record<string, unknown>)) : undefined}
        onSubmit={(body) => save.mutateAsync({ id: isNew ? undefined : (editing as T).id, body })}
        submitLabel={isNew ? `Create ${noun.toLowerCase()}` : "Save changes"}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`${deleteLabel ?? "Delete"} ${labelOf(deleting) ?? noun.toLowerCase()}?`}
        description={deleteLabel ? `${labelOf(deleting) ?? "They"} will no longer be able to log in. Their history stays intact.` : "This cannot be undone. Items already used on subscriptions or invoices keep their history."}
        confirmLabel={`${deleteLabel ?? "Delete"} ${noun.toLowerCase()}`}
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: () => setDeleting(null),
          })
        }
      />
    </>
  );
}
