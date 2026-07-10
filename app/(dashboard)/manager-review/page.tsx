import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkflowReviewRecords } from "../../../components/WorkflowReviewRecords.tsx";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";
import { requireUser } from "../../../lib/auth.ts";
import { isPreviewMode } from "../../../lib/preview-data.ts";

export default async function ManagerReviewPage() {
  const user = await requireUser();
  if (user.role !== "admin" && !isPreviewMode()) redirect("/");

  const checklistPhases = cardStoreWorkflow.filter((phase) => phase.checklist.length > 0);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Manager review</p>
          <h2>ตรวจงานประจำวันของหัวหน้า</h2>
          <p>ใช้ตรวจว่าพนักงานทำงานครบ ยอดขายตรง ออเดอร์ไม่ค้าง และสินค้าแพงครบก่อนปิดวัน</p>
        </div>
      </section>

      <WorkflowReviewRecords />

      <section className="workflow-panel">
        <div className="section-heading">
          <p className="eyebrow">daily checkpoints</p>
          <h2>จุดที่ต้องตรวจซ้ำ</h2>
          <p>หัวหน้าควรเทียบ checklist กับหลักฐานจริง เช่น ยอด POS สลิป รูปสินค้า และออเดอร์ค้าง</p>
        </div>
        <div className="review-table">
          {checklistPhases.map((phase) => (
            <div key={phase.id} className={`review-row phase-${phase.category}`}>
              <span className="phase-icon">{phase.icon}</span>
              <div>
                <strong>{phase.title}</strong>
                <small>{phase.caution}</small>
              </div>
              <em>{phase.checklist.length} รายการ</em>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
