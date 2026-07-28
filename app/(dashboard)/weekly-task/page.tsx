import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import {
  isWeeklyEventActiveOn,
  todayWorkDate,
  weeklyEventDaysLabel,
  weeklyEvents
} from "../../../lib/weekly-event-tasks.ts";

export default async function WeeklyTaskPage() {
  await requireUser();
  const workDate = todayWorkDate();

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly event</p>
          <h2>Checklist งานกิจกรรมประจำสัปดาห์</h2>
          <p>
            เลือกกิจกรรมที่ต้องการบันทึกงาน — แต่ละกิจกรรมมี checklist แยกหน้าของตัวเอง
            เพื่อให้ staff ทำงานได้ง่ายและไม่สับสน กิจกรรมที่ยังไม่ถึงวันจัดจะกดเข้าไปทำไม่ได้
          </p>
        </div>
      </section>

      <section className="workflow-panel">
        <div className="daily-phase-grid">
          {weeklyEvents.map((event, index) => {
            const active = isWeeklyEventActiveOn(event, workDate);
            const label = (
              <>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>Weekly event · {event.game}</small>
                  <strong>{event.name}</strong>
                  {active ? (
                    <em>{event.schedule}</em>
                  ) : (
                    <em>🔒 ยังไม่ถึงกำหนด · จัดวัน{weeklyEventDaysLabel(event)}</em>
                  )}
                </div>
              </>
            );

            // ยังไม่ถึงวันจัด → แสดงการ์ดสีเทาและปิดการกด (ไม่ใช่ลิงก์)
            if (!active) {
              return (
                <div
                  key={event.id}
                  className="daily-phase-card workflow-status-white is-muted is-locked"
                  aria-disabled="true"
                >
                  {label}
                </div>
              );
            }

            return (
              <Link
                key={event.id}
                href={`/weekly-task/${event.key}`}
                className="daily-phase-card workflow-status-white"
              >
                {label}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
