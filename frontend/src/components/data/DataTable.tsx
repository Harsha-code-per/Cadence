"use client";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUrlState } from "@/hooks/useUrlState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  count: number;
  page: number;
  pageSize?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
};

/** Server-driven: it only ever holds one page. Right-align money columns with meta: { align: "right" }. */
export function DataTable<T>({ columns, data, count, page, pageSize = 20, loading, onPageChange, onRowClick, empty }: Props<T>) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true });
  const compact = useUrlState().get("density") === "compact";
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  const align = (meta: unknown) => ((meta as { align?: string } | undefined)?.align === "right" ? "text-right" : "");

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <Table className="max-md:block">
        <TableHeader className="max-md:hidden">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TableHead key={h.id} className={cn("h-10 text-ink-2", align(h.column.columnDef.meta))}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="max-md:block">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j} className="h-11">
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick?.(row.original)}
                onKeyDown={(e) => e.key === "Enter" && onRowClick?.(row.original)}
                className={cn(compact ? "h-9" : "h-11", "max-md:grid max-md:h-auto max-md:grid-cols-2 max-md:gap-x-3 max-md:border-b max-md:p-3", onRowClick && "cursor-pointer focus-visible:bg-plum-soft")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    data-label={typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : undefined}
                    className={cn(align(cell.column.columnDef.meta), compact && "py-1", cell.column.id === "actions" && "max-md:col-span-2 max-md:pt-2", "max-md:block max-md:p-0 max-md:py-0.5 max-md:before:mb-0.5 max-md:before:block max-md:before:text-xs max-md:before:text-ink-3 max-md:before:content-[attr(data-label)]")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-ink-2">
        <span>{count === 0 ? "No results" : `${from}–${to} of ${count.toLocaleString("en-IN")}`}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next page" disabled={to >= count} onClick={() => onPageChange(page + 1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
