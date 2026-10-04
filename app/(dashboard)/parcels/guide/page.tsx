import Link from "next/link";
import { BookOpen, ClipboardCheck, PackageOpen } from "lucide-react";
import { requireUser } from "../../../../lib/auth.ts";
import { PARCEL_ARRIVAL_DAYS } from "../../../../lib/parcel-orders.ts";

// คู่มือแอดมินหน้าร้าน: รับพัสดุการ์ด → วิดีโอแกะกล่อง → เช็ค → ลงตามที่บอก
export const dynamic = "force-dynamic";

function Btn({ tone, children }: { tone: "cta" | "ok" | "bad"; children: React.ReactNode }) {
  return <span className={`parcel-guide__btn parcel-guide__btn--${tone}`}>{children}</span>;
}

export default async function ParcelGuidePage() {
  await requireUser();
  return (
    <main className="page parcel-guide">
      <header>
        <p className="eyebrow">คู่มือแอดมินหน้าร้าน</p>
        <h2>รับพัสดุการ์ดที่ร้าน</h2>
        <p className="parcel-guide__lead">
          การ์ดที่เจ้าของร้านสั่งจากพ่อค้าจะส่งมาที่ร้าน หน้าที่เราคือแกะ เช็คว่าได้ตรงไหม แล้วเอาลงตามที่เจ้าของร้านบอกไว้
        </p>
        <Link href="/parcels" className="parcel-board__new parcel-guide__open">ไปหน้าพัสดุการ์ด</Link>
      </header>

      <section className="parcel-guide__deadline" aria-label="เดดไลน์">
        <div>
          <strong>วันที่ถึง + 1 วัน</strong>
          <span>ของถึงร้านแล้ว ต้องแกะ-เช็ค-ลงให้จบภายในวันที่ของถึงหรือวันถัดไป</span>
        </div>
        <div>
          <strong>−2 คะแนน/วัน</strong>
          <span>เลยกำหนด หักหมวดงานที่มอบหมาย ทุกคนที่เข้ากะสาขานั้นวันนั้น จนกว่าจะทำจบ</span>
        </div>
      </section>

      <section className="parcel-guide__step">
        <div className="parcel-guide__head">
          <span className="parcel-guide__icon"><PackageOpen size={20} aria-hidden /></span>
          <div><p className="eyebrow">ของมาถึงร้าน</p><h3>ถ่ายวิดีโอตอนแกะกล่อง</h3></div>
        </div>
        <ul>
          <li>เปิดหน้าพัสดุการ์ด หาออเดอร์ที่ตรงกับกล่อง ดูจากชื่อร้านพ่อค้าและรูปการ์ดที่เจ้าของร้านแนบไว้</li>
          <li>กด <Btn tone="cta">ของมาแล้ว — อัปวิดีโอแกะกล่อง</Btn> มือถือจะเปิดกล้องให้</li>
          <li>ถ่ายตั้งแต่กล่องยังปิด ให้เห็นป้ายชื่อ แล้วแกะจนเห็นการ์ดครบทุกใบ ถ่ายต่อเนื่องห้ามตัด</li>
          <li>รอจนขึ้น 100% อย่าปิดหน้าจอระหว่างอัป ถ้าเน็ตช้าให้ต่อ Wi-Fi ร้าน</li>
        </ul>
      </section>

      <section className="parcel-guide__step">
        <div className="parcel-guide__head">
          <span className="parcel-guide__icon"><ClipboardCheck size={20} aria-hidden /></span>
          <div><p className="eyebrow">เช็คของ</p><h3>เทียบกับรายการทีละใบ</h3></div>
        </div>
        <ul>
          <li>ได้ตรงชื่อ ตรงจำนวน สภาพดี กด <Btn tone="ok">ตรง</Btn></li>
          <li>ได้คนละใบ หรือสภาพไม่ตรง กด <Btn tone="bad">ไม่ตรง</Btn> แล้วพิมพ์ว่าไม่ตรงยังไง</li>
          <li>ในกล่องไม่มีใบนี้ กด <Btn tone="bad">ไม่มี</Btn> แล้วพิมพ์รายละเอียด</li>
          <li>กด "ไม่ตรง" หรือ "ไม่มี" แล้ว ระบบแจ้งเจ้าของร้านทันที เราไม่ต้องตามพ่อค้าเอง</li>
        </ul>
      </section>

      <section className="parcel-guide__step">
        <div className="parcel-guide__head">
          <span className="parcel-guide__icon"><BookOpen size={20} aria-hidden /></span>
          <div><p className="eyebrow">เก็บเข้าที่</p><h3>ลงตามที่เจ้าของร้านบอก</h3></div>
        </div>
        <p>ใต้ชื่อการ์ดแต่ละใบมีป้ายบอกว่าต้องทำอะไร</p>
        <div className="parcel-guide__dest">
          <div className="is-sell"><strong>ลงแฟ้มขาย 2,890 บาท</strong><span>ใส่ซอง ติดราคาตามที่เขียน แล้วลงแฟ้มขายของสาขา</span></div>
          <div className="is-keep"><strong>เก็บไว้ก่อน (ยังไม่ขาย)</strong><span>ใส่ซอง เก็บเข้าที่เก็บของร้าน ยังไม่วางขาย</span></div>
        </div>
        <ul>
          <li>ถ้ามีหมายเหตุ เช่น "ใส่ท็อปโหลดเดอร์" ให้ทำตามด้วย</li>
          <li>ลงเสร็จแล้วกด <Btn tone="cta">ลงแล้ว</Btn> ทีละใบ ครบทุกใบ = งานกล่องนี้จบ</li>
        </ul>
      </section>

      <section className="parcel-guide__warn">
        <h3>สิ่งที่ห้ามลืม</h3>
        <p>
          ของถึงร้านวันไหน ต้องกด "ลงแล้ว" หรือแจ้ง "ไม่ตรง/ไม่มี" ให้ครบทุกใบภายในวันนั้นหรือวันถัดไป ถ้าเลยกำหนด
          ระบบหักคะแนนเองทุกวัน ทุกคนที่เข้ากะสาขานั้น จนกว่าจะทำจบ
        </p>
        <p>กล่องที่ถึงแล้วแต่ยังไม่จบจะขึ้นบนหน้าหลักของทุกคนในสาขา ใครอยู่ร้านก็หยิบทำแทนกันได้</p>
      </section>

      <section className="parcel-guide__faq">
        <h3>ถามบ่อย</h3>
        <details><summary>กดผิด ทำยังไง</summary><p>กด "ย้อน" ข้างรายการนั้น แล้วเช็คใหม่ได้เลย</p></details>
        <details><summary>กล่องบุบ หรือได้ของเกินมา</summary><p>กด "แจ้งปัญหาอื่น" ใต้ออเดอร์ แล้วพิมพ์รายละเอียด เจ้าของร้านจะได้รับแจ้งทันที การ์ดใบที่ตรงก็ยังลงตามปกติ</p></details>
        <details><summary>หาออเดอร์ของกล่องนี้ไม่เจอ</summary><p>อย่าแกะทิ้งไว้เฉยๆ ทักเจ้าของร้านก่อน เจ้าของร้านอาจยังไม่ได้ลงออเดอร์ในระบบ</p></details>
        <details><summary>อัปวิดีโอไม่ขึ้น</summary><p>วิดีโอต้องไม่เกิน 600MB ถ้าถ่าย 4K ให้เปลี่ยนเป็น 1080p ต่อ Wi-Fi แล้วลองใหม่ ถ้ายังไม่ได้ให้กดปุ่มแจ้งปัญหาในเว็บ SOP พร้อมแนบรูปหน้าจอ</p></details>
        <details><summary>ของส่งไปเสนาเฟสต์</summary><p>ปกติของลงบางแค บางกล่องเจ้าของร้านตั้งให้ส่งไปเสนาเฟสต์ กล่องนั้นจะขึ้นที่หน้าของพนักงานเสนาเฟสต์ และนับคะแนนเฉพาะคนที่เข้ากะสาขานั้น</p></details>
        <details><summary>ของยังไม่มาเลย ต้องทำอะไรไหม</summary><p>ไม่ต้อง ถ้าสั่งแล้วเกิน {PARCEL_ARRIVAL_DAYS} วันยังไม่ถึง ระบบเตือนเจ้าของร้านให้ไปตามพ่อค้าเอง</p></details>
      </section>
    </main>
  );
}
