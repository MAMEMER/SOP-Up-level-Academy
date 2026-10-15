import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { fetchCustomerOrders } from "../lib/customer-orders-server.ts";
import { orderCounts } from "../lib/customer-orders.ts";

// หน้าหลักพนักงาน: "ออเดอร์ลูกค้า" (ค้นเบอร์ได้ทันที + งานที่ค้าง) และ "ทำอะไร บันทึกที่ไหน"
// — แก้ปัญหาน้องหาไม่เจอว่างานแต่ละอย่างต้องไปกดที่หน้าไหน.

const WHERE: Array<{ job: string; href: string; place: string }> = [
  { job: "ลูกค้ามารับของ / ถามออเดอร์ / ต้องส่งของ", href: "/orders", place: "ออเดอร์ลูกค้า" },
  { job: "พัสดุการ์ดมาถึงร้าน", href: "/parcels", place: "พัสดุการ์ด" },
  { job: "ของใกล้หมด ต้องสั่งเพิ่ม", href: "/supplies", place: "ของที่ต้องสั่ง" },
  { job: "ปิดยอดเงินสิ้นวัน", href: "/closing", place: "ปิดยอด" },
  { job: "เช็คลิสต์เปิด/ปิดร้าน", href: "/checklist", place: "เช็คลิสต์" },
  { job: "งานที่ได้รับมอบหมาย", href: "/my-view", place: "งานของฉัน" }
];

export async function OrdersTodoCard() {
  let counts: ReturnType<typeof orderCounts> | null = null;
  try {
    counts = orderCounts((await fetchCustomerOrders()).orders);
  } catch {
    counts = null;
  }
  return (
    <article className="task-section orders-todo">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">หาไม่เจอ เริ่มที่นี่</p>
          <h3>ออเดอร์ลูกค้า</h3>
        </div>
        {counts?.todo ? <span className="status-pill is-late">ต้องส่งมอบ {counts.todo}</span> : null}
      </div>

      <form action="/orders" className="orders-board__search">
        <Search size={18} aria-hidden />
        <input type="search" name="q" placeholder="ลูกค้ามารับของ? พิมพ์เบอร์หรือชื่อ" aria-label="ค้นออเดอร์ลูกค้า" />
      </form>

      {counts ? (
        <div className="orders-todo__counts">
          <Link href="/orders?f=todo">
            <b>{counts.todo}</b> ต้องส่งมอบ
          </Link>
          <Link href="/orders?f=review">
            <b>{counts.review}</b> รอตรวจสลิป
          </Link>
          <Link href="/orders?f=unpaid">
            <b>{counts.unpaid}</b> ยังจ่ายไม่ครบ
          </Link>
        </div>
      ) : null}

      <details className="orders-todo__where">
        <summary>ทำอะไร บันทึกที่ไหน</summary>
        <ul>
          {WHERE.map((w) => (
            <li key={w.href}>
              <Link href={w.href}>
                <span>{w.job}</span>
                <span className="orders-todo__place">
                  {w.place}
                  <ChevronRight size={16} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
