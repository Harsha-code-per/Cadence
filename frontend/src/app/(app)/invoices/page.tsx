import { Suspense } from "react";
import { InvoicesView } from "@/components/invoices/InvoicesView";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Invoices" };

function InvoicesSkeleton() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every bill in one place: drafts, confirmed invoices, what has been paid and what is still owed."
      />
      <div aria-hidden className="space-y-4">
        <Skeleton className="h-8 w-full max-w-72" />
        <Skeleton className="h-72 w-full" />
      </div>
    </>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<InvoicesSkeleton />}>
      <InvoicesView />
    </Suspense>
  );
}
