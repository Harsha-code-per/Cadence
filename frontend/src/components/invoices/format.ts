// Display helpers for invoice screens. No money math: amounts come from the API as strings.

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Local calendar day as YYYY-MM-DD, used as the default "Bill as of" date. */
export function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function sentence(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  upi: "UPI",
  cheque: "Cheque",
};

export function paymentMethodLabel(value: string) {
  return PAYMENT_METHODS[value] ?? sentence(value);
}
