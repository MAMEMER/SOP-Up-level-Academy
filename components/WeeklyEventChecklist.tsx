"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWorkDate } from "../lib/workflow-records.ts";
import {
  canSubmitWeeklyEvent,
  seatingTableRules,
  weeklyEventCompleted,
  weeklyEvents,
  type WeeklyEvent,
  type WeeklyEventChecklistItem
} from "../lib/weekly-event-tasks.ts";
import {
  fetchWeeklyEventPayload,
  fieldKey,
  saveWeeklyEventPayload,
  submitKey,
  tickKey,
  weeklyEventPeriodKey,
  type WeeklyEventPayload
} from "../lib/weekly-event-store.ts";
import { ChecklistCompleteOverlay, useChecklistCompleteRedirect } from "./ChecklistCompleteRedirect.tsx";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";

export function WeeklyEventChecklist({ eventId }: { eventId?: string } = {}) {
  const { redirecting, goToDashboard } = useChecklistCompleteRedirect();
  // แสดงเฉพาะกิจกรรมที่ระบุ (แยกหน้าละกิจกรรม) — ถ้าไม่ระบุ แสดงทั้งหมด
  const events = useMemo(
    () => (eventId ? weeklyEvents.filter((event) => event.id === eventId) : weeklyEvents),
    [eventId]
  );
  // periodKey (วันทำงาน YYYY-MM-DD) คำนวณ client-side เท่านั้น กัน hydration mismatch จาก new Date()
  const [periodKey, setPeriodKey] = useState<string>("");
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const key = weeklyEventPeriodKey(formatWorkDate());
    setPeriodKey(key);
    fetchWeeklyEventPayload(key)
      .then((payload) => {
        if (!alive) return;
        setTicks(payload.ticks);
        setData(payload.data);
        setSubmitted(payload.submitted);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  function persist(next: Partial<WeeklyEventPayload>) {
    if (!periodKey) return;
    void saveWeeklyEventPayload(periodKey, { ticks, data, submitted, ...next });
  }

  function eventTicked(event: WeeklyEvent): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const item of event.checklist) map[item.id] = Boolean(ticks[tickKey(periodKey, event.id, item.id)]);
    return map;
  }

  function toggle(event: WeeklyEvent, itemId: string) {
    if (!periodKey || !loaded) return;
    const key = tickKey(periodKey, event.id, itemId);
    const next = { ...ticks, [key]: !ticks[key] };
    setTicks(next);
    persist({ ticks: next });
  }

  function updateField(event: WeeklyEvent, itemId: string, field: string, value: string) {
    if (!periodKey || !loaded) return;
    const next = { ...data, [fieldKey(periodKey, event.id, itemId, field)]: value };
    setData(next);
    persist({ data: next });
  }

  function saveDraft(event: WeeklyEvent) {
    if (!loaded) return;
    persist({});
    setSavedAt((current) => ({ ...current, [event.id]: new Date().toLocaleTimeString("th-TH") }));
  }

  function submit(event: WeeklyEvent) {
    if (!periodKey || !loaded || !canSubmitWeeklyEvent(event, eventTicked(event))) return;
    const next = { ...submitted, [submitKey(periodKey, event.id)]: true };
    setSubmitted(next);
    persist({ submitted: next });
    // checklist ของกิจกรรมนี้ครบ 100% แล้ว (ส่งได้เมื่อทำครบทุกข้อ) → กลับหน้า Dashboard
    goToDashboard();
  }

  return (
    <section className="workflow-panel">
      <ChecklistCompleteOverlay show={redirecting} />
      <div className="trial-banner">
        <strong>Checklist วันกิจกรรม</strong>
        <span>
          ติ๊กงานหลักของวันกิจกรรมให้ครบทั้ง 6 ข้อ ตั้งแต่ Final ของแจก จนถึงสรุปและประกาศของรางวัล ·
          โพสต์ประกาศกิจกรรมและโพสต์ขอบคุณอยู่ใน Assigned work บน Dashboard
        </span>
      </div>

      <div className="checklist-workflow">
        {events.map((event) => (
          <WeeklyEventCard
            key={event.id}
            event={event}
            periodKey={periodKey}
            ticked={eventTicked(event)}
            data={data}
            submitted={Boolean(submitted[submitKey(periodKey, event.id)])}
            savedLabel={savedAt[event.id]}
            onToggle={(itemId) => toggle(event, itemId)}
            onField={(itemId, field, value) => updateField(event, itemId, field, value)}
            onSave={() => saveDraft(event)}
            onSubmit={() => submit(event)}
          />
        ))}
      </div>
    </section>
  );
}

function WeeklyEventCard({
  event,
  periodKey,
  ticked,
  data,
  submitted,
  savedLabel,
  onToggle,
  onField,
  onSave,
  onSubmit
}: {
  event: WeeklyEvent;
  periodKey: string;
  ticked: Record<string, boolean>;
  data: Record<string, string>;
  submitted: boolean;
  savedLabel?: string;
  onToggle: (itemId: string) => void;
  onField: (itemId: string, field: string, value: string) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const completed = weeklyEventCompleted(event, ticked);
  const total = event.checklist.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const canSubmit = completed === total;

  return (
    <section id={event.id} className="training-card phase-event weekly-event-card">
      <div className="workflow-card-head">
        <span className="phase-icon">EV</span>
        <div>
          <p className="eyebrow">Weekly event · {event.game}</p>
          <h3>{event.name}</h3>
        </div>
        <div className="workflow-card-meta">
          <em>{completed}/{total}</em>
          <a className="detail-inline-link" href={event.trainingHref}>
            คู่มือ / Detail
          </a>
        </div>
      </div>

      <div className="runner-status">
        <div>
          <span>ความคืบหน้า checklist</span>
          <strong>{progress}%</strong>
        </div>
        <div>
          <span>เวลา checklist</span>
          <strong>{event.timeWindow}</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-tick-list">
        {event.checklist.map((item, index) => (
          <WeeklyEventItem
            key={item.id}
            event={event}
            item={item}
            index={index}
            periodKey={periodKey}
            checked={Boolean(ticked[item.id])}
            data={data}
            onToggle={() => onToggle(item.id)}
            onField={(field, value) => onField(item.id, field, value)}
          />
        ))}
      </div>

      <div className="example-box">
        <strong>ตัวอย่างข้อความสรุป (คัดลอกไปใช้ได้)</strong>
        <pre className="weekly-event-summary">{event.summaryTemplate}</pre>
      </div>

      {!canSubmit ? (
        <p className="phase-warning">ติ๊ก checklist ให้ครบทั้ง {total} ข้อก่อนจึงจะส่งงานได้ (ตอนนี้ {completed}/{total})</p>
      ) : null}

      <div className="workflow-record-actions">
        <button type="button" className="soft-button" onClick={onSave}>
          บันทึก (draft)
        </button>
        <button type="button" className="green-button" onClick={onSubmit} disabled={!canSubmit || submitted}>
          {submitted ? "ส่งงานแล้ว" : "ส่งงาน"}
        </button>
        <strong className={submitted ? "record-status submitted" : "record-status"}>
          {submitted ? "ส่งงานวันนี้แล้ว" : savedLabel ? `บันทึก draft แล้ว ${savedLabel}` : "ยังไม่ส่ง"}
        </strong>
      </div>
    </section>
  );
}

function WeeklyEventItem({
  event,
  item,
  index,
  periodKey,
  checked,
  data,
  onToggle,
  onField
}: {
  event: WeeklyEvent;
  item: WeeklyEventChecklistItem;
  index: number;
  periodKey: string;
  checked: boolean;
  data: Record<string, string>;
  onToggle: () => void;
  onField: (field: string, value: string) => void;
}) {
  const value = (field: string) => (periodKey ? data[fieldKey(periodKey, event.id, item.id, field)] || "" : "");

  return (
    <div id={`${event.id}-${item.id}`} className="tick-group has-detail">
      <label className={checked ? "tick-row done" : "tick-row"}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>
          {index + 1}. {item.title}
          {item.rule ? <em className="weekly-event-rule">{item.rule}</em> : null}
        </span>
      </label>

      <div className="detail-panel">
        {item.hint ? (
          <div className="detail-panel-head">
            <small>{item.hint}</small>
          </div>
        ) : null}

        <div className="weekly-event-fields">
          {item.requiredData.map((field) => (
            <label
              key={field.key}
              className={`workflow-note-field compact${field.type === "textarea" ? " full" : ""}${
                item.extra === "pairing-link" && field.key === "pairing_url" ? " highlight" : ""
              }`}
            >
              <span>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  value={value(field.key)}
                  placeholder={field.placeholder}
                  onChange={(e) => onField(field.key, e.target.value)}
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "time" ? "time" : field.type === "url" ? "url" : "text"}
                  value={value(field.key)}
                  placeholder={field.placeholder}
                  onChange={(e) => onField(field.key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        {item.extra === "table-rule" ? (
          <div className="weekly-event-tablerule">
            <strong>กติกาจำนวนโต๊ะตามจำนวนผู้เล่น</strong>
            <ul>
              {seatingTableRules.map((rule) => (
                <li key={rule.players}>
                  {rule.players} = {rule.tables}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="weekly-event-evidence">
          <span>หลักฐานที่ต้องแนบ</span>
          <ul>
            {item.evidence.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <div className="detail-upload">
            <span>อัปโหลดรูปหลักฐาน (แนบรูป/สกรีนช็อตจากคอมได้ สูงสุด 5 รูป)</span>
            <EvidencePhotosInput
              value={value("__photos")}
              onChange={(next) => onField("__photos", next)}
              max={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
