import type { Metadata } from "next";
import { MpNav } from "../../../components/masterplan/MpNav.tsx";
import { requireMasterplanMember } from "../../../lib/masterplan-auth.ts";

// Masterplan workspace — its own minimal shell (NOT the SOP AppShell, which calls
// requireUser() and would bounce ท้อป, who is a Masterplan member but not SOP staff).

export const metadata: Metadata = { title: "Masterplan · Up Level" };
export const dynamic = "force-dynamic";

export default async function MasterplanLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMasterplanMember();
  return (
    <div className="mp-root">
      <MpNav memberKey={member.key} memberName={member.name} />
      <main className="mp-main">{children}</main>
    </div>
  );
}
