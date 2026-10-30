"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import {
  LOAD_LABEL,
  capacityMinutes,
  clampMinutes,
  clampTimes,
  dayLoad,
  formatHours,
  isGuess,
  itemMinutes,
  loadLevel,
  monthDates,
  staffMonth,
  weekdayRows,
  type ManHourDoc,
  type ManHourEstimates,
  type ManHourItem,
  type ManHourSettings,
  type ManHourSource,
  type ShiftCell
} from "../lib/man-hours.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";

type Props = {
  branch: string;
  month: string;
  canEdit: boolean;
  items: ManHourItem[];
  doc: ManHourDoc;
  workHours: number;
  cells: ShiftCell[];
  /** รหัส → ชื่อ (ตัดสินฝั่ง server กันชื่อไม่ตรงตอน hydrate) */
  names: Record<string, string>;
};

type Draft = { estimates: ManHourEstimates; settings: ManHourSettings };

const SOURCE_LABEL: Record<ManHourSource, { title: string; hint: string }> = {
  daily: { title: "เช็คลิสต์รายวัน", hint: "นาทีต่อกะ · หัวข้อที่ทั้ง 2 กะทำ นับแยกกะละครั้ง · หารคนในกะนั้น" },
  task: { title: "งานประจำสัปดาห์ / เดือน", hint: "นาทีต่อรอบ · หารทุกคนที่มาทำงานวันนั้น" },
  event: { title: "วันกิจกรรมประจำสัปดาห์", hint: "นาทีต่อวันกิจกรรม · หารทุกคนที่มาทำงานวันนั้น" }
};

const WEEKDAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];

function pct(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

function Meter({ ratio }: { ratio: number }) {
  const level = loadLevel(ratio);
  return (
    <span className={`mh-meter is-${level}`} aria-hidden="true">
      <i style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
    </span>
  );
}

function LevelTag({ ratio }: { ratio: number }) {
  const level = loadLevel(ratio);
  return <span className={`mh-tag is-${level}`}>{LOAD_LABEL[level]}</span>;
}

export function ManHoursBoard({ branch, month, canEdit, items, doc, workHours, cells, names }: Props) {
  const storageKey = `sop-man-hours-draft:${branch}`;
  const [saved, setSaved] = useState<Draft>({ estimates: doc.estimates, settings: doc.settings });
  const [draft, setDraft] = useState<Draft>(saved);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [meta, setMeta] = useState({ updatedAt: doc.updatedAt, updatedBy: doc.updatedBy });
  const restored = useRef(false);

  // กันงานหาย: ร่างที่ยังไม่บันทึกเก็บไว้ในเครื่อง ปิดหน้าแล้วกลับมาก็ยังอยู่
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDraft(JSON.parse(raw) as Draft);
    } catch {
      /* ไม่มีที่เก็บในเครื่อง — ใช้ค่าที่บันทึกไว้ */
    }
  }, [storageKey]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [draft, dirty, storageKey]);

  const { estimates, settings } = draft;
  const capacity = capacityMinutes(workHours, settings);
  const dates = useMemo(() => monthDates(month), [month]);
  const loads = useMemo(() => dates.map((date) => dayLoad(items, estimates, settings, date, cells)), [dates, items, estimates, settings, cells]);
  const staff = useMemo(() => staffMonth(loads, workHours, settings), [loads, workHours, settings]);
  const weekdays = useMemo(() => weekdayRows(loads), [loads]);

  // วันทำงานปกติ: เช็คลิสต์ของกะ (ทำทุกวัน) — ถ้าอยู่คนเดียวทั้งกะ
  const perShift = useMemo(() => {
    const out: Record<ShiftCode, number> = { s1: 0, s2: 0 };
    for (const item of items) if (item.source === "daily") for (const shift of item.shifts) out[shift] += itemMinutes(item, estimates);
    return out;
  }, [items, estimates]);
  const poolPerDay = loads.length ? loads.reduce((sum, load) => sum + load.poolMinutes, 0) / loads.length : 0;
  const guessCount = items.filter((item) => isGuess(item, estimates)).length;
  const hasSchedule = cells.length > 0;
  const team = staff.reduce(
    (acc, row) => ({ work: acc.work + row.work, capacity: acc.capacity + row.capacity }),
    { work: 0, capacity: 0 }
  );

  function setEstimate(item: ManHourItem, patch: Partial<{ minutes: number; times: number }>) {
    setDraft((prev) => {
      const current = prev.estimates[item.key] || { minutes: item.guessMinutes, times: 1 };
      return { ...prev, estimates: { ...prev.estimates, [item.key]: { ...current, ...patch } } };
    });
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/man-hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branch, estimates, settings })
      });
      if (!res.ok) throw new Error(res.status === 403 ? "บัญชีนี้ไม่มีสิทธิ์บันทึก" : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      const data = (await res.json()) as { updatedAt: string; updatedBy: string };
      setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      // ค่าที่บันทึกแล้ว = ค่าใหม่ของหน้า (ไม่ต้องรีโหลด)
      setSaved({ estimates, settings });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      setStatus({ kind: "saved", text: "บันทึกแล้ว" });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" });
    }
  }

  const groups = useMemo(() => {
    const out: Array<{ source: ManHourSource; group: string; items: ManHourItem[] }> = [];
    for (const item of items) {
      const bucket = out.find((g) => g.source === item.source && g.group === item.group);
      if (bucket) bucket.items.push(item);
      else out.push({ source: item.source, group: item.group, items: [item] });
    }
    return out;
  }, [items]);

  return (
    <div className="mh-board">
      {/* ---- 1 วันปกติ ---- */}
      <section className="sdoc-section">
        <p className="eyebrow">1 กะปกติ ถ้าอยู่คนเดียวในกะ</p>
        <p className="sdoc-help">
          กะละ {workHours} ชม. หักพัก {settings.breakMinutes} นาที = ทำงานได้ {formatHours(capacity)} · เวลาที่เหลือคือเวลาดูแลลูกค้า/ขายหน้าร้าน
        </p>
        <ul className="mh-shifts">
          {(["s1", "s2"] as ShiftCode[]).map((shift) => {
            const work = perShift[shift] + poolPerDay / 2;
            const ratio = capacity ? work / capacity : 0;
            return (
              <li key={shift}>
                <div className="mh-shifts__head">
                  <strong>{shift === "s1" ? "กะ 1 (เปิดร้าน)" : "กะ 2 (ปิดร้าน)"}</strong>
                  <LevelTag ratio={ratio} />
                </div>
                <Meter ratio={ratio} />
                <div className="mh-shifts__nums">
                  <span>งาน <b>{formatHours(work)}</b></span>
                  <span>ว่าง <b>{formatHours(capacity - work)}</b></span>
                  <span>{pct(ratio)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="sdoc-hint">
          รวมงานสั่ง + งานวันกิจกรรม เฉลี่ยวันละ {formatHours(poolPerDay)} (แบ่งครึ่งให้ 2 กะ)
          {guessCount ? ` · ยังเป็นค่าเดา ${guessCount} จาก ${items.length} รายการ — ใส่เวลาจริงด้านล่างให้ตัวเลขแม่นขึ้น` : ""}
        </p>
      </section>

      {/* ---- รายคน ---- */}
      <section className="sdoc-section">
        <p className="eyebrow">รายคน ทั้งเดือน ตามตารางกะจริง</p>
        {hasSchedule ? (
          <>
            <div className="flower-target-stats">
              <div><small>งานทั้งทีม</small><strong>{formatHours(team.work)}</strong></div>
              <div><small>เวลาทำงานได้ทั้งทีม</small><strong>{formatHours(team.capacity)}</strong></div>
              <div><small>เวลาว่างรวม</small><strong>{formatHours(team.capacity - team.work)}</strong></div>
              <div><small>ใช้ไป</small><strong>{team.capacity ? pct(team.work / team.capacity) : "–"}</strong></div>
            </div>
            <ul className="mh-staff">
              {staff.map((row) => (
                <li key={row.staffCode}>
                  <div className="mh-staff__who">
                    <strong>{names[row.staffCode] || row.staffCode}</strong>
                    <small>{row.shifts} กะ · หนักสุด {row.peakDate ? Number(row.peakDate.slice(8)) : "–"} ({formatHours(row.peakMinutes)})</small>
                  </div>
                  <Meter ratio={row.ratio} />
                  <div className="mh-staff__nums">
                    <span>งาน {formatHours(row.work)} · ว่าง {formatHours(row.free)}</span>
                    <LevelTag ratio={row.ratio} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="sdoc-help">เดือนนี้ยังไม่มีตารางกะของสาขานี้ — ลงกะที่ /admin/schedule แล้วตัวเลขรายคนจะขึ้นเอง</p>
        )}
      </section>

      {/* ---- ตามวันในสัปดาห์ ---- */}
      {hasSchedule ? (
        <section className="sdoc-section">
          <p className="eyebrow">ตามวันในสัปดาห์ · งานต่อคน</p>
          <div className="mh-week" role="table" aria-label="ภาระงานต่อคน ตามวันในสัปดาห์">
            <div className="mh-week__row is-head" role="row">
              <span role="columnheader">วัน</span>
              <span role="columnheader">กะ 1</span>
              <span role="columnheader">กะ 2</span>
            </div>
            {weekdays.map((row) => (
              <div className="mh-week__row" role="row" key={row.weekday}>
                <span role="cell">{WEEKDAY[row.weekday]}</span>
                {(["s1", "s2"] as ShiftCode[]).map((shift) => {
                  const ratio = capacity ? row.perPerson[shift] / capacity : 0;
                  return (
                    <span role="cell" key={shift} className="mh-week__cell">
                      {row.heads[shift] ? (
                        <>
                          <b>{formatHours(row.perPerson[shift])}</b>
                          <small>
                            {row.staffedDays[shift] < row.days ? `มีคน ${row.staffedDays[shift]}/${row.days} วัน` : `${row.heads[shift].toFixed(1).replace(/\.0$/, "")} คน`} · {pct(ratio)}
                          </small>
                          <Meter ratio={ratio} />
                        </>
                      ) : (
                        <small>ไม่มีคนลงกะ</small>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- ตั้งค่า ---- */}
      <section className="sdoc-section">
        <p className="eyebrow">ตั้งค่า</p>
        <div className="mh-settings">
          <label>
            <span>พักต่อกะ (นาที)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              value={settings.breakMinutes}
              disabled={!canEdit}
              onChange={(e) => setDraft((prev) => ({ ...prev, settings: { ...prev.settings, breakMinutes: Math.min(180, clampMinutes(e.target.value)) } }))}
            />
          </label>
          <label className="mh-check">
            <input
              type="checkbox"
              checked={settings.includeEvents}
              disabled={!canEdit}
              onChange={(e) => setDraft((prev) => ({ ...prev, settings: { ...prev.settings, includeEvents: e.target.checked } }))}
            />
            <span>นับงานวันกิจกรรมประจำสัปดาห์ (Gym / Lorcana / Riftbound …)</span>
          </label>
        </div>
      </section>

      {/* ---- เวลาต่องาน ---- */}
      {(["daily", "task", "event"] as ManHourSource[]).map((source) => {
        const sourceGroups = groups.filter((g) => g.source === source);
        if (!sourceGroups.length) return null;
        const off = source === "event" && !settings.includeEvents;
        return (
          <section className={`sdoc-section mh-items${off ? " is-off" : ""}`} key={source}>
            <p className="eyebrow">เวลาต่องาน · {SOURCE_LABEL[source].title}</p>
            <p className="sdoc-help">{SOURCE_LABEL[source].hint}{off ? " · ตอนนี้ปิดไว้ ไม่นับ" : ""}</p>
            {sourceGroups.map((group) => {
              const total = group.items.reduce((sum, item) => sum + itemMinutes(item, estimates), 0);
              return (
                <div className="mh-group" key={`${source}-${group.group}`}>
                  <div className="mh-group__head">
                    <strong>{group.group}</strong>
                    <span>{formatHours(total)}{source === "daily" ? " ต่อกะ" : " ต่อรอบ"}</span>
                  </div>
                  <ul>
                    {group.items.map((item) => {
                      const est = estimates[item.key];
                      const minutes = est ? est.minutes : item.guessMinutes;
                      const times = est ? est.times : 1;
                      return (
                        <li key={item.key} className={isGuess(item, estimates) ? "is-guess" : undefined}>
                          <div className="mh-item__text">
                            <span className="mh-item__title">{item.title}</span>
                            <small>
                              {item.frequency}
                              {isGuess(item, estimates) ? " · ค่าเดา" : ""}
                            </small>
                          </div>
                          <div className="mh-item__inputs">
                            <label>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={600}
                                value={minutes}
                                disabled={!canEdit}
                                aria-label={`นาที: ${item.title}`}
                                onChange={(e) => setEstimate(item, { minutes: clampMinutes(e.target.value) })}
                              />
                              <span>นาที</span>
                            </label>
                            <label>
                              <span>×</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={50}
                                value={times}
                                disabled={!canEdit}
                                aria-label={`จำนวนครั้ง: ${item.title}`}
                                onChange={(e) => setEstimate(item, { times: clampTimes(e.target.value) })}
                              />
                              <span>ครั้ง</span>
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="sdoc-section">
        <p className="sdoc-hint">
          {meta.updatedAt
            ? `บันทึกล่าสุด ${new Date(meta.updatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}${meta.updatedBy ? ` โดย ${meta.updatedBy}` : ""}`
            : "ยังไม่เคยบันทึก — ตัวเลขทั้งหมดตอนนี้มาจากค่าเดา"}
          {" · "}ว่างเยอะ &lt; 50% · พอดี 50–80% · แน่น 80–100% · เกินเวลา &gt; 100%
        </p>
      </section>

      {canEdit && (dirty || status.kind !== "idle") ? (
        <div className="mh-savebar" role="region" aria-label="บันทึก">
          <span className={`mh-savebar__status is-${status.kind}`} aria-live="polite">
            {status.kind === "saving" ? "กำลังบันทึก…" : status.text || (dirty ? "ยังไม่ได้บันทึก (ร่างเก็บไว้ในเครื่องแล้ว)" : "")}
          </span>
          {dirty ? (
            <>
              <button type="button" className="mh-btn is-ghost" onClick={() => { setDraft(saved); setStatus({ kind: "idle" }); }}>
                <RotateCcw size={16} aria-hidden="true" /> ย้อนกลับ
              </button>
              <button type="button" className="mh-btn" onClick={save} disabled={status.kind === "saving"}>
                <Save size={16} aria-hidden="true" /> บันทึก
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
