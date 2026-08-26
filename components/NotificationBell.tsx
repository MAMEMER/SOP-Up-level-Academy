"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  NOTIFICATION_KIND_CLASS,
  NOTIFICATION_KIND_LABEL,
  notificationTimeLabel,
  unreadByKind,
  unreadCount,
  type StaffNotification
} from "../lib/staff-notifications.ts";

/** รีเฟรชเองทุก 2 นาที — งานใหม่/คำติชมจะโผล่โดยไม่ต้องกดรีโหลดหน้า */
const REFRESH_MS = 120_000;

/**
 * กระดิ่งแจ้งเตือนบนหัวเว็บ — งานที่มอบหมาย · งานส่งต่อ · งานส่งของ · คำแนะนำหัวหน้า ·
 * เสียงจากลูกค้า อยู่ในที่เดียว. กดเปิดแล้วถือว่าอ่านทุกอย่างถึงตอนนั้น.
 */
export function NotificationBell() {
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { notifications?: StaffNotification[] }) : { notifications: [] };
      setItems(data.notifications || []);
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // เปิดดู = อ่านแล้ว — บันทึกเวลาไว้ที่ server แล้วรีโหลดสถานะ
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "markSeen" })
      });
    } catch {
      /* กดดูได้แม้บันทึกไม่สำเร็จ — แค่ badge จะยังค้าง */
    }
  }

  const unread = unreadCount(items);
  if (!loaded && items.length === 0) return null;

  return (
    <div className="bell">
      <button
        type="button"
        className="bell__button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `แจ้งเตือน ${unread} รายการที่ยังไม่ได้อ่าน` : "แจ้งเตือน"}
      >
        แจ้งเตือน
        {unread > 0 ? <span className="bell__badge">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="bell__panel" role="dialog" aria-label="รายการแจ้งเตือน">
          <div className="bell__panel-head">
            <strong>แจ้งเตือน</strong>
            <button type="button" onClick={() => { setOpen(false); void load(); }} aria-label="ปิด">ปิด</button>
          </div>

          {unread > 0 ? (
            <div className="bell__summary">
              {unreadByKind(items).map((row) => (
                <span key={row.kind} className={`bell__chip ${NOTIFICATION_KIND_CLASS[row.kind]}`}>
                  {NOTIFICATION_KIND_LABEL[row.kind]} {row.count}
                </span>
              ))}
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="bell__empty">ยังไม่มีแจ้งเตือน</p>
          ) : (
            <ul className="bell__list">
              {items.map((item) => (
                <li key={item.id} className={item.unread ? "bell__item is-unread" : "bell__item"}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    <span className={`bell__kind ${NOTIFICATION_KIND_CLASS[item.kind]}`}>{NOTIFICATION_KIND_LABEL[item.kind]}</span>
                    <strong>{item.title}</strong>
                    {item.detail ? <em>{item.detail}</em> : null}
                    <small>{notificationTimeLabel(item.at)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
