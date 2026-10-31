import { PageHeader } from "@/components/layout/PageHeader";
import { AccountSettings } from "./AccountSettings";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your account and password." />
      <AccountSettings />
    </>
  );
}
