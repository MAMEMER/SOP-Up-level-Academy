"use client";

// ประวัติการกดปุ่ม "ส่งงาน" — เขียนตอนกด ไม่ใช่ตอนบันทึกสำเร็จ จึงใช้ตรวจได้ว่าน้องกดจริง
// ไหมแม้ในรอบที่ระบบบันทึกไม่ผ่าน (ดู app/api/submit-log/route.ts)

export type SubmitLogEntry = {
  id: string;
  staffCode: string;
  employeeEmail: string;
  employeeName: string;
  workDate: string;
  phaseId: string;
  phaseTitle: string;
  pressedAt: string;
  receivedAt: string;
  saved: boolean;
  impersonating: boolean;
};

/** ยิงแบบไม่ขวางงานหลัก — log พังต้องไม่ทำให้การส่งงานพัง */
export function logSubmitPress(input: {
  workDate: string;
  phaseId: string;
  phaseTitle: string;
  pressedAt: string;
  ok: boolean;
}): void {
  void fetch("/api/submit-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true
  }).catch(() => undefined);
}

export async function fetchSubmitLog(workDate: string): Promise<SubmitLogEntry[]> {
  const res = await fetch(`/api/submit-log?workDate=${encodeURIComponent(workDate)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json()) as { entries?: SubmitLogEntry[] };
  return payload.entries || [];
}

/** "กด 2 ครั้ง · 12:40, 15:03" — ข้อความสรุปให้เจ้าของร้านอ่านทีเดียวจบ */
export function summarisePresses(entries: SubmitLogEntry[], timeLabel: (iso: string) => string): string {
  if (!entries.length) return "";
  const times = entries.map((entry) => timeLabel(entry.pressedAt)).join(", ");
  const failed = entries.filter((entry) => !entry.saved).length;
  const base = `กด ${entries.length} ครั้ง · ${times}`;
  return failed ? `${base} · ไม่ถึงระบบ ${failed} ครั้ง` : base;
}
