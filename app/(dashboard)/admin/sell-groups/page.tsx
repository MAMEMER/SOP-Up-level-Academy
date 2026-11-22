import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";
import { GroupEditor } from "../../../../components/SellGroupEditor.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (user.role !== "admin" && !isOwner(user.email)) redirect("/my-view");
  const groups = hasAdminCredentials() ? (await adminDb().collection("sop_config").doc("sell_groups").get()).data()?.groups || [] : [];
  return <main className="page"><Link href="/admin" className="back-link">← กลับหน้าจัดการ</Link><GroupEditor initial={groups} readOnly={user.isImpersonating} /></main>;
}
