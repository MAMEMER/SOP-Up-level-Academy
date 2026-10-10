import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireUser } from "../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../lib/employee-directory.ts";
import { isOwner } from "../../../lib/owner.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { loadCardPrices, type CardPricesData } from "../../../lib/card-prices-server.ts";
import { CardPricesBoard } from "../../../components/CardPricesBoard.tsx";

// ราคากลางการ์ด + สเกาต์ — พนักงานทุกคนดูได้ ทักท้วงได้ ตั้งจับตาการ์ดได้
// ราคามาจากบอทไลน์บน mini (อ่านโพสต์ซื้อขายในกลุ่ม FB วันละ 5 รอบ)
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

export default async function CardPricesPage() {
  const user = await requireUser();
  const roster = await listStaff();
  // เจ้าของไม่อยู่ใน employee directory — หาโค้ดจากรายชื่อเข้าระบบแทน (UP-001 = แชมป์)
  const staffCode =
    employeeCodeForEmail(user.email) || roster.find((s) => s.email === user.email.trim().toLowerCase())?.code || "";
  let data: CardPricesData | null = null;
  let error = "";
  try {
    data = await loadCardPrices();
  } catch (err) {
    error = err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้";
  }
  const staff = user.role === "admin"
    ? roster.filter((s) => s.active && s.code).map((s) => ({ code: s.code, name: s.name }))
    : [];

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ตลาดการ์ด · กลุ่ม FB</p>
          <h2>ราคากลางการ์ด</h2>
          <p>
            ราคาจากโพสต์ขายจริงในกลุ่มซื้อขาย{data?.meta ? ` ${data.meta.groups} กลุ่ม` : ""} ย้อนหลัง{" "}
            {data?.meta?.windowDays ?? 45} วัน · นับราคาล่าสุดของคนขายแต่ละคน ตัดราคาหลุดโลกทิ้ง
            {data?.meta?.updatedAt ? ` · อัปเดต ${thaiDateTime(data.meta.updatedAt)}` : ""}
          </p>
          <p>เห็นราคาไหนไม่น่าใช่ กดที่การ์ดแล้วทักท้วงได้เลย · อยากให้จับตาใบไหน ตั้งสเกาต์ไว้ บอทเจอแล้วทักไลน์บอก</p>
          {user.role === "admin" ? (
            <p className="cp-hero-links">
              <Link href="/card-prices/events" className="cp-secondary">
                <CalendarDays size={18} aria-hidden /> งานแข่งร้านอื่น
              </Link>
            </p>
          ) : null}
        </div>
      </section>
      {error || !data ? (
        <p className="detail-hint">โหลดราคาไม่สำเร็จ — {error || "ยังไม่ได้ตั้งค่าเชื่อม Firestore"}</p>
      ) : (
        <CardPricesBoard
          data={data}
          me={{ code: staffCode, admin: user.role === "admin", owner: isOwner(user.actualEmail), readOnly: user.isImpersonating }}
          staff={staff}
        />
      )}
    </main>
  );
}
