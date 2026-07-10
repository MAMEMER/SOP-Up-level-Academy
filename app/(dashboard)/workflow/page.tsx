import Link from "next/link";
import { cardStoreWorkflow } from "../../../lib/card-store-workflow.ts";

export default function WorkflowPage() {
  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Workflow detail</p>
          <h2>ลำดับงานทั้งวัน</h2>
          <p>อ่านตามเวลาและทำงานจากบนลงล่าง ตั้งแต่ก่อนเปิดร้านจนล็อกร้าน</p>
        </div>
      </section>

      <div className="workflow-detail-list">
        {cardStoreWorkflow.map((phase, index) => (
          <section key={phase.id} id={phase.id} className={`workflow-detail-card phase-${phase.category}`}>
            <div className="workflow-card-head">
              <span className="phase-icon">{phase.icon}</span>
              <div>
                <p className="eyebrow">{String(index + 1).padStart(2, "0")} · {phase.timeLabel}</p>
                <h3>{phase.title}</h3>
              </div>
            </div>
            <p className="detail-lead compact">{phase.goal}</p>
            <div className="training-section-grid">
              {phase.sections.map((section) => (
                <section key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.tasks.map((task) => <li key={task}>{task}</li>)}
                  </ul>
                </section>
              ))}
            </div>
            <div className="caution-box">
              <strong>สิ่งที่ต้องระวัง</strong>
              <span>{phase.caution}</span>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
