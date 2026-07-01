import { AppShell } from "../../components/AppShell.tsx";
import { requireUser } from "../../lib/auth.ts";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
