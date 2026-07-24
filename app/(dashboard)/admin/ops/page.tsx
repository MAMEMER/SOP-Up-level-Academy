import { redirect } from "next/navigation";
import { AdminOpsDashboard } from "../../../../components/AdminOpsDashboard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";
import { isOwner } from "../../../../lib/owner.ts";

export default async function AdminOpsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  // ยอดขาย/เงินสด = owner-only (Champ + Nem), hidden from regular admins
  return <AdminOpsDashboard isOwner={isOwner(user.email)} />;
}
