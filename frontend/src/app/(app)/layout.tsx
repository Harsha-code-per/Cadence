import { RoleGate } from "@/components/auth/RoleGate";
import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate allow={["admin", "staff"]}>
      <AppShell>{children}</AppShell>
    </RoleGate>
  );
}
