import { redirect } from "next/navigation";
import { AdminOpsDashboard } from "../../../../components/AdminOpsDashboard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";

export default async function AdminOpsPage() {
  const user = await requireUser();
  if (user.role !== "admin" && !isPreviewMode()) redirect("/");

  return <AdminOpsDashboard />;
}
