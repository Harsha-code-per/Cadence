import type { FieldDef } from "../components/forms/ResourceDialog";

/** Preserve decimal strings and distinguish optional defaults from nullable fields. */
export function toApi(fields: FieldDef[], values: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if ((v === "" || v == null) && f.emptyValue !== undefined) out[f.name] = f.emptyValue;
    else if (f.kind === "number") out[f.name] = v === "" ? null : Number(v);
    else if (f.kind === "select") out[f.name] = v === "" ? null : isNaN(Number(v)) ? v : Number(v);
    else if (f.kind === "date" || f.kind === "money") out[f.name] = v === "" ? null : v;
    else out[f.name] = v;
  }
  return out;
}
