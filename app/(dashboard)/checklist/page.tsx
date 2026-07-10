import Link from "next/link";
import { WorkflowChecklist } from "../../../components/WorkflowChecklist.tsx";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { requireUser } from "../../../lib/auth.ts";

export default async function ChecklistPage() {
  const user = await requireUser();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Interactive checklist</p>
          <h2>Checklist งานประจำวัน</h2>
          <p>ติ๊กงานที่ทำเสร็จแล้ว ระบบจะแสดงเปอร์เซ็นต์ความคืบหน้าทั้งวัน</p>
        </div>
      </section>
      <WorkflowChecklist phases={cardStoreWorkflow} userEmail={user.email} userRole={user.role} />
    </main>
  );
}
