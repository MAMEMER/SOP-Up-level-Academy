"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FEEDBACK_KIND_CLASS,
  FEEDBACK_KIND_LABEL,
  feedbackDateLabel,
  pendingReviewCount,
  tally,
  type StaffFeedback,
  type StaffFeedbackKind
} from "../lib/staff-feedback.ts";

type Row = StaffFeedback & { memberName?: string };

async function act(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/staff-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
}

/**
 * เสียงจากสมาชิก (ชม/แนะนำ/ติ) บนหน้าประเมินผลงาน.
 * พนักงานเห็นเฉพาะเสียงที่ถูกเปิดให้เห็นแล้ว และไม่เห็นว่าใครส่ง ·
 * หัวหน้าเห็นทั้งหมดพร้อมชื่อผู้ส่ง แล้วกด "ให้พนักงานเห็น" หรือ "ซ่อน" ได้.
 */
export function StaffFeedbackPanel({ staffCode, isAdmin, readOnly = false }: { staffCode: string; isAdmin: boolean; readOnly?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff-feedback?staffCode=${encodeURIComponent(staffCode)}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { feedback?: Row[] }) : { feedback: [] };
      setRows(data.feedback || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [staffCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(body: Record<string, unknown>) {
    try {
      await act(body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  const counts = tally(rows as Array<{ kind: StaffFeedbackKind }>);
  const pending = isAdmin ? pendingReviewCount(rows) : 0;

  if (!loading && rows.length === 0) {
    return (
      <section className="feedback">
        <p className="self-review__label">เสียงจากสมาชิก</p>
        <p className="self-review__empty">
          {isAdmin ? "ยังไม่มีสมาชิกส่งความเห็นถึงคนนี้" : "ยังไม่มีความเห็นจากสมาชิกในรอบนี้"}
        </p>
      </section>
    );
  }

  return (
    <section className="feedback">
      <div className="feedback__head">
        <p className="self-review__label">เสียงจากสมาชิก</p>
        <span className="feedback__tally">
          ชม {counts.praise} · แนะนำ {counts.suggestion} · ติ {counts.complaint}
        </span>
        {pending > 0 ? <span className="feedback__pending">รอตรวจ {pending}</span> : null}
      </div>

      {loading ? (
        <p className="self-review__empty">กำลังโหลด…</p>
      ) : (
        <ul className="feedback__list">
          {rows.map((item) => (
            <li key={item.id} className={`feedback__item ${FEEDBACK_KIND_CLASS[item.kind]}`}>
              <p className="feedback__meta">
                <span className="feedback__kind">{FEEDBACK_KIND_LABEL[item.kind]}</span>
                <span>{feedbackDateLabel(item.createdAt)}</span>
                {/* ชื่อผู้ส่งมาจาก API เฉพาะตอนหัวหน้าดู — ฝั่งพนักงานไม่มีฟิลด์นี้เลย */}
                {item.memberName ? <span>จาก {item.memberName}</span> : null}
                {isAdmin ? (
                  <span className={item.visibleToStaff ? "feedback__state is-on" : "feedback__state"}>
                    {item.hidden ? "ซ่อนแล้ว" : item.visibleToStaff ? "พนักงานเห็นแล้ว" : "ยังไม่ส่งต่อ"}
                  </span>
                ) : null}
              </p>
              <p className="feedback__message">{item.message}</p>
              {isAdmin && !readOnly ? (
                <div className="feedback__actions">
                  <button type="button" onClick={() => run({ action: "setVisible", id: item.id, visible: !item.visibleToStaff })}>
                    {item.visibleToStaff ? "ไม่ให้พนักงานเห็น" : "ให้พนักงานเห็น"}
                  </button>
                  {!item.hidden ? (
                    <button type="button" className="feedback__hide" onClick={() => run({ action: "hide", id: item.id })}>
                      ซ่อน (สแปม/ไม่เกี่ยวกับงาน)
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="project-progress-form__error">{error}</p> : null}
    </section>
  );
}
