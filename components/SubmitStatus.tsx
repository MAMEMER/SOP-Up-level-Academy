// ป้ายสถานะการส่งงาน — ตัวเดียวทุกหน้า น้องต้องดูแวบเดียวรู้ว่า "ส่งแล้ว ระบบได้รับ" หรือ "ยังไม่ส่ง".
// เดิมแต่ละหน้าเขียนเองคนละแบบ ตัวเล็ก และบางหน้าขึ้น "บันทึกแล้ว" ซึ่งน้องอ่านเป็น "ส่งแล้ว" →
// เจ้าของต้องมาไล่ถามว่ากดหรือยัง. "ส่งแล้ว" ต้องขึ้นเฉพาะเมื่อ server ยืนยันแล้วเท่านั้น.

import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";

export type SubmitState = "not_sent" | "sending" | "sent" | "failed";

/** "2026-10-07T07:32:00Z" → "14:32" เวลาไทย */
export function bangkokTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export function SubmitStatus({
  state,
  sentAt,
  hint,
  compact = false
}: {
  state: SubmitState;
  /** เวลาที่ระบบได้รับ (ISO) — โชว์ต่อท้าย "ส่งแล้ว" */
  sentAt?: string | null;
  /** บรรทัดเล็กใต้ป้าย เช่น "บันทึกไว้แล้ว แต่ยังไม่ได้กดส่ง" */
  hint?: string;
  compact?: boolean;
}) {
  const time = bangkokTime(sentAt);
  const title =
    state === "sent"
      ? `ส่งแล้ว${time ? ` · ระบบได้รับ ${time} น.` : " · ระบบได้รับแล้ว"}`
      : state === "sending"
        ? "กำลังส่ง… อย่าเพิ่งปิดหน้านี้"
        : state === "failed"
          ? "ส่งไม่ถึงระบบ — กดส่งอีกครั้ง"
          : "ยังไม่ส่ง";
  const Icon = state === "sent" ? CheckCircle2 : state === "sending" ? Loader2 : state === "failed" ? TriangleAlert : CircleDashed;
  return (
    <div className={`submit-status submit-status--${state}${compact ? " submit-status--compact" : ""}`} role="status" aria-live="polite">
      <Icon size={compact ? 18 : 22} aria-hidden="true" className="submit-status__icon" />
      <span>
        <strong>{title}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </div>
  );
}
