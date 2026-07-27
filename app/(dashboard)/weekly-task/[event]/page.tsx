import Link from "next/link";
import { notFound } from "next/navigation";
import { WeeklyEventChecklist } from "../../../../components/WeeklyEventChecklist.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { weeklyEvents } from "../../../../lib/weekly-event-tasks.ts";

export default async function WeeklyEventPage({
  params
}: {
  params: Promise<{ event: string }>;
}) {
  await requireUser();
  const { event: eventKey } = await params;
  const event = weeklyEvents.find((item) => item.key === eventKey);
  if (!event) notFound();

  return (
    <main className="page">
      <Link href="/weekly-task" className="back-link">← กลับ Weekly task</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Weekly event · {event.game}</p>
          <h2>Checklist {event.name}</h2>
          <p>
            บันทึกงานหลักของวันกิจกรรม {event.name} ตั้งแต่ Final ของแจก เตรียมพื้นที่ เตรียมเว็บ pairing
            เริ่มกิจกรรม ลงผลแต่ละรอบใน{event.lineGroup} จนถึงสรุปและประกาศของรางวัล
          </p>
        </div>
      </section>
      <WeeklyEventChecklist eventId={event.id} />
    </main>
  );
}
