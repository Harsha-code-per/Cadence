"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm, type FieldValues } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { applyServerErrors, Field, errorOf } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Option = { value: string | number; label: string };

type Base = { name: string; label: string; required?: boolean; hint?: string; wide?: boolean };
export type FieldDef =
  | (Base & { kind: "text" | "textarea" | "date" | "number" | "money" })
  | (Base & { kind: "checkbox" })
  | (Base & { kind: "select"; options: Option[]; allowEmpty?: boolean })
  | (Base & { kind: "multi"; options: Option[] })
  | (Base & { kind: "custom"; render: (value: unknown, onChange: (v: unknown) => void) => React.ReactNode });

const MONEY = /^\d+(\.\d{1,2})?$/;

function schemaFor(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const req = f.required ? "Required." : undefined;
    switch (f.kind) {
      case "text":
      case "textarea":
        shape[f.name] = f.required ? z.string().trim().min(1, req) : z.string();
        break;
      case "date":
        shape[f.name] = f.required ? z.string().min(1, req) : z.string();
        break;
      case "number":
        shape[f.name] = z.string().regex(/^\d*$/, "Enter a whole number.").refine((v) => !f.required || v !== "", req);
        break;
      case "money":
        shape[f.name] = z.string().refine((v) => v === "" ? !f.required : MONEY.test(v), "Enter an amount like 1200.00.");
        break;
      case "checkbox":
        shape[f.name] = z.boolean();
        break;
      case "select":
        shape[f.name] = z.string().refine((v) => !f.required || v !== "", req);
        break;
      default:
        shape[f.name] = z.any();
    }
  }
  return z.object(shape);
}

/** API value → form value (everything text-like is a string in the form). */
function toForm(fields: FieldDef[], data?: Record<string, unknown>) {
  const out: FieldValues = {};
  for (const f of fields) {
    const v = data?.[f.name];
    if (f.kind === "checkbox") out[f.name] = data ? Boolean(v) : false;
    else if (f.kind === "multi") out[f.name] = (v as number[]) ?? [];
    else if (f.kind === "custom") out[f.name] = v ?? null;
    else out[f.name] = v == null ? "" : String(v);
  }
  return out;
}

/** Form value → API payload. Money stays a string; empty optional values become null. */
function toApi(fields: FieldDef[], values: FieldValues) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.kind === "number") out[f.name] = v === "" ? null : Number(v);
    else if (f.kind === "select") out[f.name] = v === "" ? null : isNaN(Number(v)) ? v : Number(v);
    else if (f.kind === "date") out[f.name] = v === "" ? null : v;
    else if (f.kind === "money") out[f.name] = v === "" ? null : v;
    else out[f.name] = v;
  }
  return out;
}

/** Create/edit dialog generated from a field list; server field_errors land on the matching field. */
export function ResourceDialog({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  onSubmit,
  submitLabel = "Save",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  submitLabel?: string;
}) {
  const schema = useMemo(() => schemaFor(fields), [fields]);
  const form = useForm<FieldValues>({ resolver: zodResolver(schema), defaultValues: toForm(fields, initial) });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(toForm(fields, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(toApi(fields, values));
      onOpenChange(false);
    } catch (e) {
      if (!applyServerErrors(e, form.setError)) toast.error(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} autoComplete="off" className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {fields.map((f) => (
            <div key={f.name} className={cn(f.wide || f.kind === "textarea" || f.kind === "multi" || f.kind === "custom" ? "sm:col-span-2" : "")}>
              <Field label={f.label + (f.required ? "" : " (optional)")} error={errorOf(errors, f.name)} hint={f.hint}>
                <Controller
                  control={form.control}
                  name={f.name}
                  render={({ field }) => {
                    switch (f.kind) {
                      case "textarea":
                        return <Textarea rows={3} {...field} />;
                      case "checkbox":
                        return (
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(Boolean(c))} /> {f.label}
                          </label>
                        );
                      case "select":
                        return (
                          <select
                            className="h-9 w-full rounded-md border border-input bg-surface px-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring"
                            {...field}
                          >
                            {(!f.required || f.allowEmpty) && <option value="">None</option>}
                            {f.required && field.value === "" && <option value="" disabled>Choose…</option>}
                            {f.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        );
                      case "multi":
                        return (
                          <div className="flex flex-wrap gap-3 rounded-md border p-2.5">
                            {f.options.length === 0 && <span className="text-sm text-ink-3">Nothing to choose from yet.</span>}
                            {f.options.map((o) => {
                              const on = (field.value as (string | number)[]).includes(o.value);
                              return (
                                <label key={o.value} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={on}
                                    onCheckedChange={(c) =>
                                      field.onChange(c ? [...field.value, o.value] : field.value.filter((x: unknown) => x !== o.value))
                                    }
                                  />
                                  {o.label}
                                </label>
                              );
                            })}
                          </div>
                        );
                      case "custom":
                        return <>{f.render(field.value, field.onChange)}</>;
                      case "money":
                        return <Input inputMode="decimal" placeholder="0.00" className="text-right" {...field} />;
                      case "number":
                        return <Input inputMode="numeric" {...field} />;
                      case "date":
                        return <Input type="date" {...field} />;
                      default:
                        return <Input {...field} />;
                    }
                  }}
                />
              </Field>
            </div>
          ))}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
