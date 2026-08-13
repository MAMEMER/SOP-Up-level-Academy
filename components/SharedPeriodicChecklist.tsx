"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { periodicTickKey, periodKeyFor, resolvePeriodicUnits, scopeForPeriod } from "../lib/periodic-tasks.ts";
import { answerNeedsInput, type ItemAnswer, type OverrideItem } from "../lib/checklist-overrides.ts";
import { useChecklistScopeConfig } from "../lib/checklist-overrides-store.ts";
import { fetchSharedTicks, setSharedTick, type SharedTick } from "../lib/shared-tasks-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

// แท็บ Weekly / Monthly ของหน้าเช็คลิสต์ — งานที่ทีมช่วยกันทำ.
// เจ้าของตั้งได้ว่าแต่ละรายการ "ส่งงานแบบไหน" (ติ๊กเฉยๆ / พิมพ์ข้อความ / ตัวเลข / แนบรูป / วางลิงก์ /
// เลือกตัวเลือก) เหมือนตั้งคำถามใน Google Form — รายการที่ต้องกรอก จะกดติ๊กไม่ได้จนกว่าจะกรอกครบ.
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
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSharedTicks(branch, period, periodKey)
      .then((data) => alive && setTicks(data))
      .catch(() => alive && setTicks({}))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, period, periodKey]);

  async function toggle(taskId: string, answer?: { value?: string; photos?: string[] }) {
    if (readOnly) return;
    const ticked = !ticks[taskId];
    const optimistic = { ...ticks };
    if (ticked) optimistic[taskId] = { by: staffCode, at: "…", ...answer };
    else delete optimistic[taskId];
    setTicks(optimistic);
    setBusyKey(taskId);
    try {
      const next = await setSharedTick({
        branch,
        period,
        periodKey,
        taskId,
        ticked,
        by: staffCode,
        atIso: new Date().toISOString(),
        currentTicks: ticks,
        value: answer?.value,
        photos: answer?.photos
      });
      setTicks(next);
    } catch {
      setTicks(ticks); // revert on failure
    } finally {
      setBusyKey(null);
    }
  }

  const allKeys = units.flatMap((unit) => unit.items.map((item) => periodicTickKey(period, unit.id, item.id)));
  const done = allKeys.filter((key) => ticks[key]).length;

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
        {period === "weekly" ? "สัปดาห์นี้" : "เดือนนี้"} ({periodKey}) · เสร็จ {done}/{allKeys.length} · ช่วยกันทั้งทีม
      </p>
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
                  disabled={loading || readOnly || busyKey === key}
                  onToggle={(answer) => toggle(key, answer)}
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

/** ข้อความสรุปคำตอบที่บันทึกไว้ ใต้รายการที่ติ๊กแล้ว */
function answeredSummary(tick: SharedTick): string | null {
  if (tick.value) return tick.value;
  if (tick.photos?.length) return `แนบรูป ${tick.photos.length} รูป`;
  return null;
}

function SharedTaskRow({
  item,
  tick,
  disabled,
  onToggle
}: {
  item: OverrideItem;
  tick: SharedTick | undefined;
  disabled: boolean;
  onToggle: (answer?: { value?: string; photos?: string[] }) => void;
}) {
  const answer: ItemAnswer | undefined = item.answer;
  const needsInput = answerNeedsInput(answer);
  const [value, setValue] = useState("");
  const [photos, setPhotos] = useState("");

  const photoUrls = photos.split("\n").map((url) => url.trim()).filter(Boolean);
  const filled = answer?.kind === "photo" ? photoUrls.length > 0 : value.trim().length > 0;
  const blocked = needsInput && !tick && !filled;
  const summary = tick ? answeredSummary(tick) : null;

  function submit() {
    if (tick) {
      onToggle(); // ติ๊กซ้ำ = ยกเลิกการติ๊ก
      return;
    }
    if (!needsInput) {
      onToggle();
      return;
    }
    onToggle(answer?.kind === "photo" ? { photos: photoUrls } : { value: value.trim() });
    setValue("");
    setPhotos("");
  }

  return (
    <li className={tick ? "shared-checklist__item shared-checklist__item--done" : "shared-checklist__item"}>
      <button type="button" onClick={submit} aria-pressed={!!tick} disabled={disabled || blocked}>
        {tick ? "●" : "○"}
      </button>
      <span>
        <strong>{item.title}</strong>
        {item.timeLabel || item.shiftLabel ? (
          <em className="shared-checklist__item-meta">{[item.timeLabel, item.shiftLabel].filter(Boolean).join(" · ")}</em>
        ) : null}
        <ChecklistItemGuide note={item.note} links={item.links} />

        {/* ช่องกรอกตามแบบที่เจ้าของตั้งไว้ — โชว์เฉพาะตอนที่ยังไม่ติ๊ก */}
        {needsInput && !tick ? (
          <span className="shared-checklist__answer">
            {answer?.kind === "photo" ? (
              <EvidencePhotosInput value={photos} onChange={setPhotos} disabled={disabled} label={answer.placeholder || "แนบรูป"} />
            ) : answer?.kind === "choice" ? (
              <select value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled} aria-label="เลือกคำตอบ">
                <option value="">{answer.placeholder || "เลือก…"}</option>
                {(answer.options || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={answer?.kind === "number" ? "number" : "text"}
                inputMode={answer?.kind === "number" ? "numeric" : answer?.kind === "link" ? "url" : undefined}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  answer?.placeholder ||
                  (answer?.kind === "number" ? "ใส่ตัวเลข" : answer?.kind === "link" ? "https://…" : "พิมพ์สั้นๆ")
                }
                aria-label="คำตอบ"
              />
            )}
            {blocked ? <small className="shared-checklist__answer-hint">กรอกก่อนถึงจะติ๊กได้</small> : null}
          </span>
        ) : null}

        {summary ? <small className="shared-checklist__answer-done">{summary}</small> : null}
        {tick?.photos?.length ? (
          <small className="shared-checklist__answer-done">
            {tick.photos.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">รูป{index + 1} </a>
            ))}
          </small>
        ) : null}
        {tick ? <small>โดย {displayNameFor(tick.by)}</small> : null}
      </span>
    </li>
  );
}
