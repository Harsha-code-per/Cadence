// Response shapes from GET /api/invoices/ and GET /api/invoices/{id}/ (docs/API.md).
// Money arrives as strings: keep it that way.

export type InvoiceStatus = "draft" | "confirmed" | "paid" | "cancelled";

export type CustomerSummary = {
  id: number;
  name: string;
  company: string;
};

export type SubscriptionSummary = {
  id: number;
  number: string;
  status: string;
};

export type InvoiceLineTax = {
  id: number;
  tax: number | null;
  name: string;
  rate: string;
  amount: string;
};

export type InvoiceLine = {
  id: number;
  product: number | null;
  product_name: string;
  description: string;
  quantity: number;
  unit_price: string;
  amount: string;
  discount_amount: string;
  tax_amount: string;
  total: string;
  taxes: InvoiceLineTax[];
};

export type PaymentSummary = {
  id: number;
  number: string;
  method: string;
  amount: string;
  payment_date: string;
  reference: string;
  note: string;
  created_at: string;
};

export type InvoiceChange = {
  kind: string;
  description: string;
  amount_delta: string;
};

export type Invoice = {
  id: number;
  number: string;
  status: InvoiceStatus;
  customer: CustomerSummary;
  subscription: SubscriptionSummary;
  invoice_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  outstanding: string;
  is_overdue: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceDetail = Invoice & {
  lines: InvoiceLine[];
  payments: PaymentSummary[];
  changes: InvoiceChange[];
};

export type CustomerOption = {
  id: number;
  name: string;
  company: string;
};

export type BillingRunResult = {
  activated: number;
  closed: number;
  invoiced: number;
  skipped: number;
  total_billed?: string;
  discounts_applied?: string;
  ran_at: string;
  dry_run: boolean;
};

export type BillingRunSummary = {
  run_date: string;
  ran_at: string;
  triggered_by: string;
  activated: number;
  closed: number;
  invoiced: number;
  skipped: number;
};

export type LastBillingRun = {
  last_run: BillingRunSummary | null;
};
