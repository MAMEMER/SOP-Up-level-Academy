import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { weeklyEvents } from "../../../lib/weekly-event-tasks.ts";

export default async function WeeklyTaskPage() {
  await requireUser();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly event</p>
          <h2>Checklist งานกิจกรรมประจำสัปดาห์</h2>
          <p>
            เลือกกิจกรรมที่ต้องการบันทึกงาน — แต่ละกิจกรรมมี checklist แยกหน้าของตัวเอง
            เพื่อให้ staff ทำงานได้ง่ายและไม่สับสน
          </p>
        </div>
      </section>

      <section className="workflow-panel">
        <div className="daily-phase-grid">
          {weeklyEvents.map((event, index) => (
            <Link
              key={event.id}
              href={`/weekly-task/${event.key}`}
              className="daily-phase-card workflow-status-white"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>Weekly event · {event.game}</small>
                <strong>{event.name}</strong>
                <em>{event.schedule}</em>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
