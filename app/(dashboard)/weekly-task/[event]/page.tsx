import Link from "next/link";
import { notFound } from "next/navigation";
import { WeeklyEventChecklist } from "../../../../components/WeeklyEventChecklist.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import {
  isWeeklyEventActiveOn,
  todayWorkDate,
  weeklyEventDaysLabel,
  weeklyEvents
} from "../../../../lib/weekly-event-tasks.ts";

export default async function WeeklyEventPage({
  params
}: {
  params: Promise<{ event: string }>;
}) {
  await requireUser();
  const { event: eventKey } = await params;
  const event = weeklyEvents.find((item) => item.key === eventKey);
  if (!event) notFound();

  // ล็อคการเข้าทำ: ถ้ายังไม่ถึงวันจัดกิจกรรม (ตามตาราง) ห้ามเข้าไปทำ checklist
  const workDate = todayWorkDate();
  const active = isWeeklyEventActiveOn(event, workDate);

  return (
    <main className="page">
      <Link href="/weekly-task" className="back-link">← กลับ Weekly task</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly event · {event.game}</p>
          <h2>Checklist {event.name}</h2>
          {active ? (
            <p>
              บันทึกงานหลักของวันกิจกรรม {event.name} ตั้งแต่ Final ของแจก เตรียมพื้นที่ เตรียมเว็บ pairing
              เริ่มกิจกรรม ลงผลแต่ละรอบใน{event.lineGroup} จนถึงสรุปและประกาศของรางวัล
            </p>
          ) : (
            <p>
              กิจกรรม {event.name} จัดวัน{weeklyEventDaysLabel(event)} — ยังไม่ถึงกำหนดในวันนี้
              จึงยังเข้าไปทำ checklist ไม่ได้ กลับมาทำได้ในวันจัดกิจกรรม
            </p>
          )}
        </div>
      </section>
      {active ? (
        <WeeklyEventChecklist eventId={event.id} />
      ) : (
        <section className="workflow-panel">
          <div className="empty-state">
            <p className="empty-state-title">🔒 ยังไม่ถึงกำหนดทำกิจกรรมนี้</p>
            <p>
              {event.name} จัดทุกวัน{weeklyEventDaysLabel(event)} — เข้าไปทำ checklist ได้เฉพาะวันจัดกิจกรรมเท่านั้น
            </p>
            <Link href="/weekly-task" className="status-pill">← กลับไปเลือกกิจกรรม</Link>
          </div>
        </section>
      )}
    </main>
  );
}
