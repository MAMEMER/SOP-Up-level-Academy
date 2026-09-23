"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { TaskProgressPanel, type ProgressPayload } from "./TaskProgressPanel.tsx";
import { periodicTickKey, periodKeyFor, resolvePeriodicUnits, scopeForPeriod } from "../lib/periodic-tasks.ts";
import type { OverrideItem } from "../lib/checklist-overrides.ts";
import { useChecklistScopeConfig } from "../lib/checklist-overrides-store.ts";
import { fetchSharedTicks, updateSharedProgress, type SharedTick } from "../lib/shared-tasks-store.ts";
import { percentOf, summarizeProgress, type TaskProgressAction, type TaskProgressEntry } from "../lib/task-progress.ts";

// แท็บ Weekly / Monthly ของหน้าเช็คลิสต์ — งานที่ทีมช่วยกันทำ.
// งานพวกนี้กินเวลาหลายชั่วโมงและข้ามวันได้ (นับ stock ทั้งร้าน / ทำความสะอาดใหญ่) เลยลงงาน
// ได้ละเอียดกว่าติ๊กว่าทำแล้ว: กดเริ่มทำ → อัพเดทเป็น % พร้อมโน้ตและรูป → ติดปัญหา → เสร็จ
// ใครในทีมกดต่อจากคนอื่นก็ได้ และเห็นว่าใครทำถึงไหนไว้ (ดู TaskProgressPanel).
// เจ้าของยังตั้งได้ว่าแต่ละรายการ "ส่งงานแบบไหน" — ระบบจะขอตอนกดเสร็จ.
export function SharedPeriodicChecklist({
  period,
  branch,
  workDate,
  staffCode,
  readOnly = false
}: {
  period: "weekly" | "monthly";
  branch: string;
  workDate: string;
  /** who is ticking — falls back to "-" for admins not in the directory */
  staffCode: string;
  /** Admin previewing this account — read the shared ticks, never write them. */
  readOnly?: boolean;
}) {
  const periodKey = periodKeyFor(period, workDate);
  // หัวข้อ + รายการ ตามที่เจ้าของแก้ไว้ (/admin/checklist-config/weekly|monthly) — ยังไม่โหลดเสร็จ
  // ก็ขึ้นรายการ built-in ไปก่อน เหมือน checklist รายวัน
  const config = useChecklistScopeConfig(scopeForPeriod(period));
  const units = resolvePeriodicUnits(period, config);
  const [ticks, setTicks] = useState<Record<string, SharedTick>>({});
  const [progress, setProgress] = useState<Record<string, TaskProgressEntry>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSharedTicks(branch, period, periodKey)
      .then((data) => {
        if (!alive) return;
        setTicks(data.ticks);
        setProgress(data.progress);
      })
      .catch(() => {
        if (!alive) return;
        setTicks({});
        setProgress({});
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, period, periodKey]);

  async function act(taskId: string, action: TaskProgressAction, payload?: ProgressPayload) {
    if (readOnly) return;
    setBusyKey(taskId);
    try {
      const next = await updateSharedProgress({ branch, period, periodKey, taskId, action, ...payload });
      setTicks(next.ticks);
      setProgress(next.progress);
      setError(null);
    } catch {
      setError("บันทึกไม่สำเร็จ — ลองอีกครั้ง");
    } finally {
      setBusyKey(null);
    }
  }

  const allKeys = units.flatMap((unit) => unit.items.map((item) => periodicTickKey(period, unit.id, item.id)));
  const summary = summarizeProgress(allKeys.map((key) => ({ done: Boolean(ticks[key]), entry: progress[key] })));

  // ย้ายไปอยู่ในระบบสั่งงานแล้ว — ชี้ไปที่เดียว ไม่ให้ทีมติ๊กซ้ำสองที่แล้วเถียงกันว่าอันไหนจริง
  if (config.migratedToTasks) {
    return (
      <div className="shared-checklist">
        <p className="shared-checklist__meta">
          งาน{period === "weekly" ? "ประจำสัปดาห์" : "ประจำเดือน"}ย้ายไปอยู่ในหน้า “งานวันนี้” แล้ว —
          ระบบจะขึ้นให้เองเมื่อถึงวันที่ต้องทำ
        </p>
        <Link href="/tasks" className="primary-action">เปิดหน้างานวันนี้</Link>
      </div>
    );
  }

  return (
    <div className="shared-checklist">
      <p className="shared-checklist__meta">
        {period === "weekly" ? "สัปดาห์นี้" : "เดือนนี้"} ({periodKey}) · เสร็จ {summary.done}/{summary.total} · รวม {summary.percent}%
        {summary.active ? ` · กำลังทำ ${summary.active}` : ""}
        {summary.stuck ? ` · ติดปัญหา ${summary.stuck}` : ""} · ช่วยกันทั้งทีม
      </p>
      <span className="today-tasks__bar" role="img" aria-label={`งานรอบนี้คืบหน้า ${summary.percent}%`}>
        <span className="today-tasks__bar-fill" style={{ width: `${summary.percent}%` }} />
      </span>
      {error ? <p className="project-progress-form__error">{error}</p> : null}
      {/* Tasks render immediately — never hide the list behind a spinner (that made the tab look
          empty / "ไม่ไป" while Firestore loaded ticks on a slow connection). Tick state just fills
          in when the fetch resolves. */}
      {units.map((unit) => (
        <section key={unit.id} className="shared-checklist__unit">
          {/* หัวข้อ + รายละเอียดใต้ชื่อ (เวลา · กะ · งานนี้ทำเพื่ออะไร) แบบเดียวกับการ์ดรายวัน */}
          <p className="shared-checklist__unit-title">{unit.title}</p>
          {unit.timeLabel || unit.shiftLabel ? (
            <p className="shared-checklist__unit-meta">
              {[unit.timeLabel, unit.shiftLabel].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {unit.goal ? <p className="shared-checklist__unit-goal">{unit.goal}</p> : null}
          <ul className="shared-checklist__list">
            {unit.items.map((item) => {
              const key = periodicTickKey(period, unit.id, item.id);
              return (
                <SharedTaskRow
                  key={key}
                  item={item}
                  tick={ticks[key]}
                  entry={progress[key]}
                  readOnly={readOnly}
                  busy={loading || busyKey === key}
                  onAction={(action, payload) => void act(key, action, payload)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {units.length === 0 ? <p className="shared-checklist__meta">ยังไม่มีรายการในช่วงนี้</p> : null}
    </div>
  );
}

function SharedTaskRow({
  item,
  tick,
  entry,
  readOnly,
  busy,
  onAction
}: {
  item: OverrideItem;
  tick: SharedTick | undefined;
  entry: TaskProgressEntry | undefined;
  readOnly: boolean;
  busy: boolean;
  onAction: (action: TaskProgressAction, payload?: ProgressPayload) => void;
}) {
  const done = Boolean(tick) || entry?.status === "done";
  const percent = percentOf(entry, Boolean(tick));

  return (
    <li className={done ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
      <span className="shared-checklist__mark" aria-hidden="true">
        {done ? "●" : entry ? `${percent}%` : "○"}
      </span>
      <span>
        <strong>{item.title}</strong>
        {item.timeLabel || item.shiftLabel ? (
          <em className="shared-checklist__item-meta">{[item.timeLabel, item.shiftLabel].filter(Boolean).join(" · ")}</em>
        ) : null}
        <ChecklistItemGuide note={item.note} links={item.links} />

        <TaskProgressPanel
          entry={entry}
          done={Boolean(tick)}
          doneBy={tick?.by}
          doneAt={tick?.at}
          doneValue={tick?.value}
          donePhotos={tick?.photos}
          answer={item.answer}
          disabled={readOnly}
          busy={busy}
          onAction={onAction}
        />
      </span>
    </li>
  );
}
