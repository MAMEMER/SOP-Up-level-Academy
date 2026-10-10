import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { loadCompetitorEvents, type CompetitorEventsData } from "../../../../lib/competitor-events-server.ts";
import { bangkokToday } from "../../../../lib/competitor-events.ts";
import { CompetitorEventsBoard } from "../../../../components/CompetitorEventsBoard.tsx";

// งานแข่งร้านอื่น — บอทบน mini อ่านโพสต์ประกาศงานในกลุ่ม FB แล้วเขียน competitor_events
// เห็นเฉพาะแอดมิน/เจ้าของ (ข้อมูลวางแผนงานร้าน ไม่ใช่งานพนักงาน)
export const dynamic = "force-dynamic";

function thaiDateTime(iso?: string): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  });
}

export default async function CompetitorEventsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/card-prices");
  let data: CompetitorEventsData | null = null;
  let error = "";
  try {
    data = await loadCompetitorEvents();
  } catch (err) {
    error = err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้";
  }
  const updated = thaiDateTime(data?.meta?.updatedAt);

  return (
    <main className="page">
      <Link href="/card-prices" className="back-link">← ราคากลางการ์ด</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ตลาดการ์ด · กลุ่ม FB</p>
          <h2>งานแข่งร้านอื่น</h2>
          <p>
            งานที่ร้านอื่นประกาศในกลุ่ม FB{data?.meta?.windowDays ? ` ย้อนหลัง ${data.meta.windowDays} วัน` : ""} · วันไหนชนกับงานเรา
            มีป้ายบอก{updated ? ` · อัปเดต ${updated}` : ""}
          </p>
        </div>
      </section>
      {error || !data ? (
        <p className="detail-hint">โหลดข้อมูลไม่สำเร็จ — {error || "ยังไม่ได้ตั้งค่าเชื่อม Firestore"}</p>
      ) : (
        <CompetitorEventsBoard data={data} today={bangkokToday()} />
      )}
    </main>
  );
}
