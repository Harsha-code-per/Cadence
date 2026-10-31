import { InvoiceDetailView } from "@/components/invoices/InvoiceDetailView";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  return <InvoiceDetailView id={id} />;
}
