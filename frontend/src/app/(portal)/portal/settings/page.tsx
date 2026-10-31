"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountSettings } from "@/app/(app)/settings/AccountSettings";
import { PageHeader } from "@/components/layout/PageHeader";

export default function PortalSettingsPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to portal
      </Link>
      <PageHeader
        title="Account Settings"
        description="Update your password and view your account profile."
      />
      <AccountSettings />
    </div>
  );
}
