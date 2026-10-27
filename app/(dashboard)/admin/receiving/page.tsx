import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { ReceivingBoard } from "../../../../components/ReceivingBoard.tsx";

// รับของเข้า — แอดมินลงบิลรับของ (สินค้า+จำนวน+รูปบิล) · เจ้าของใส่ทุนแล้วกดยืนยัน
// ทุนต่อชิ้นเป็นข้อมูลเงิน เห็นเฉพาะเจ้าของ (เช็คฝั่ง server ใน /api/receivings)

export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  return (
    <main className="page sdoc-page">
      <Link href="/admin" className="back-link">← ศูนย์รวมงานจัดการ</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">สต็อก · รับของเข้า</p>
          <h2>รับของเข้า</h2>
          <p>ของมาถึงร้าน ลงบิลไว้ที่นี่ เลือกสินค้าจาก StoreHub ใส่จำนวน ถ่ายรูปบิล · เจ้าของใส่ทุนแล้วกดยืนยัน ระบบคิดทุนเฉลี่ยให้เอง</p>
        </div>
      </section>
      <ReceivingBoard />
    </main>
  );
}
