"use client";

import type { SaveStatus } from "../lib/work-records-client.ts";

// Staff need to see that a tick actually reached the server — the old build silently
// dropped everything, so "saved" has to be visible, not assumed.

const labels: Record<SaveStatus, string> = {
  idle: "บันทึกอัตโนมัติ",
  saving: "กำลังบันทึก…",
  saved: "บันทึกแล้ว",
  error: "บันทึกไม่สำเร็จ ลองติ๊กใหม่อีกครั้ง",
  "read-only": "ดูอย่างเดียว"
};

export function SaveIndicator({ status, loaded }: { status: SaveStatus; loaded: boolean }) {
  if (!loaded) return <span className="save-indicator loading">กำลังโหลดข้อมูล…</span>;
  return <span className={`save-indicator ${status}`}>{labels[status]}</span>;
}
