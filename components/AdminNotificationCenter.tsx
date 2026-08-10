import Link from "next/link";
import {
  levelLabels,
  notificationHeadline,
  summariseNotifications,
  type AdminNotification
} from "../lib/admin-notifications.ts";

// ศูนย์รวมแจ้งเตือนบนหน้า Admin Hub — ทุกเรื่องที่ต้องดูจากทุกหน้ามารวมที่เดียว
// เรียงด่วนก่อน กดแล้วไปหน้าที่แก้เรื่องนั้นได้ทันที.
// เป็น server component: ข้อมูลมากับ props จากหน้า admin ไม่ต้อง fetch ซ้ำฝั่ง client.

export function AdminNotificationCenter({ items }: { items: AdminNotification[] }) {
  const summary = summariseNotifications(items);

  return (
    <section className="admin-noti">
      <div className="admin-noti__head">
        <div>
          <p className="eyebrow">ต้องดู</p>
          <h3>แจ้งเตือนรวม</h3>
        </div>
        <span className={`status-pill ${summary.urgent ? "is-late" : ""}`}>{notificationHeadline(summary)}</span>
      </div>

      {items.length === 0 ? (
        <p className="admin-noti__clear">วันนี้ยังไม่มีเรื่องค้าง — งานส่งของ ตรวจงาน checklist และงานส่งต่อเคลียร์หมดแล้ว</p>
      ) : (
        <ul className="admin-noti__list">
          {items.map((item) => (
            <li key={item.id} className={`admin-noti__item admin-noti__item--${item.level}`}>
              <Link href={item.href}>
                <span className="admin-noti__level">{levelLabels[item.level]}</span>
                <span className="admin-noti__body">
                  <small>{item.source}</small>
                  <strong>{item.title}</strong>
                  {item.detail ? <em>{item.detail}</em> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
