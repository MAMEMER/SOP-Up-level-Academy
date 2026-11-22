import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { isOwner } from "../../../../lib/owner.ts";
import { TeamTargetsBoard } from "../../../../components/TeamTargetsBoard.tsx";
export const dynamic = "force-dynamic";
export default async function TeamTargetsPage() {
  const user = await requireUser();
  if (!isOwner(user.actualEmail) || user.isImpersonating) redirect("/admin");
  return <main className="page"><TeamTargetsBoard /></main>;
}
