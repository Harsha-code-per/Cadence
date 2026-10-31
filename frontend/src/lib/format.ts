// Display only. Amounts arrive from the API as strings; no money math happens here.
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatMoney = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : inr.format(Number(v)));

export function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : date.format(d);
}

export const formatPercent = (v: string | number) => `${Number(v)}%`;
