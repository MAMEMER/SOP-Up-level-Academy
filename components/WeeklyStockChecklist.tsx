"use client";

import { useEffect, useMemo, useState } from "react";
import { canPersistWorkflowRecords } from "../lib/workflow-records.ts";
import {
  stockRoomSheetUrl,
  stocktakeStatusOptions,
  storehubStocktakesUrl,
  submittableStocktakeStatuses,
  weeklyStockManualHref,
  weeklyStockSleevePhase,
  type WeeklyStockPhase
} from "../lib/weekly-stock-workflow.ts";

const weeklyCheckedStorageKey = "up-level-weekly-stock-checked";
const weeklyDetailStorageKey = "up-level-weekly-stock-details";
const weeklyStatusStorageKey = "up-level-weekly-stock-status";

// รหัสสัปดาห์แบบ ISO (เช่น 2026-W30) ใช้เป็น scope ของงานประจำสัปดาห์
function formatWorkWeek(date = new Date()) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function itemKey(workWeek: string, index: number) {
  return `${workWeek}:${index}`;
}

function detailKey(workWeek: string, key: string) {
  return `${workWeek}:${key}`;
}

function readStore(storageKey: string): Record<string, string | boolean> {
  if (!canPersistWorkflowRecords()) return {};
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.removeItem(storageKey);
    return {};
  }
}

function WeeklyStockTaskDetails({
  index,
  workWeek,
  status,
  updateStatus,
  details,
  updateDetail
}: {
  index: number;
  workWeek: string;
  status: string;
  updateStatus: (value: string) => void;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
}) {
  if (index === 0) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>StoreHub Stock Take</strong>
          <small>ดึงข้อมูลจำนวนอุปกรณ์ / Sleeve และเลือกสถานะ Stock Take ให้ตรงกับระบบ</small>
        </div>
        <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer" className="detail-action-link">
          เปิด StoreHub Stock Take
        </a>
        <div className="segmented-check">
          {stocktakeStatusOptions.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="weekly-stocktake-status"
                checked={status === option}
                onChange={() => updateStatus(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <p className="detail-hint">
          {submittableStocktakeStatuses.includes(status as (typeof submittableStocktakeStatuses)[number])
            ? "พร้อมส่งงานตามสถานะ Stock Take"
            : "เลือกสถานะ Stock Take เป็น In Progress หรือ Completed ก่อนส่งงาน"}
        </p>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>พื้นที่ที่นับ</strong>
          <small>ตรวจของจริง 2 ส่วน · ปัจจุบันมีสินค้าแค่หน้าร้าน (ห้อง Stock ทำเผื่อไว้)</small>
        </div>
        <div className="detail-grid">
          <label className="detail-check">
            <input
              type="checkbox"
              checked={details[detailKey(workWeek, "count-front")] === "นับแล้ว"}
              onChange={(event) => updateDetail("count-front", event.target.checked ? "นับแล้ว" : "")}
            />
            <span>จำนวนหน้าร้าน</span>
          </label>
          <label className="detail-check">
            <input
              type="checkbox"
              checked={details[detailKey(workWeek, "count-stock-room")] === "นับแล้ว"}
              onChange={(event) => updateDetail("count-stock-room", event.target.checked ? "นับแล้ว" : "")}
            />
            <span>
              ห้อง Stock
              <a href={stockRoomSheetUrl} target="_blank" rel="noreferrer" className="detail-inline-link">
                เปิด Google Sheet ห้อง Stock
              </a>
            </span>
          </label>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สรุปรายการอุปกรณ์ / Sleeve ทั้งหมด</strong>
          <small>กรอกทีละบรรทัด รูปแบบ ชื่อสินค้า | จำนวนที่เหลือ</small>
        </div>
        <label className="workflow-note-field compact">
          <span>ชื่อสินค้า | จำนวนที่เหลือ</span>
          <textarea
            value={details[detailKey(workWeek, "sleeve-summary")] || ""}
            onChange={(event) => updateDetail("sleeve-summary", event.target.value)}
            placeholder="ตัวอย่าง: Sleeve Dragon Shield ดำ | 12&#10;Deck Box แดง | 5"
          />
        </label>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สรุปรายการที่ตรงและไม่ตรง</strong>
          <small>แนบรูปแคปจากหน้า StoreHub หลังนับสินค้าเสร็จ</small>
        </div>
        <label className="workflow-note-field compact">
          <span>สรุปรายการที่ไม่ตรง (ถ้ามี)</span>
          <textarea
            value={details[detailKey(workWeek, "mismatch-summary")] || ""}
            onChange={(event) => updateDetail("mismatch-summary", event.target.value)}
            placeholder="ตัวอย่าง: Sleeve ใส | ระบบ 20 / นับจริง 18"
          />
        </label>
        <label className="detail-upload">
          <span>อัปโหลดรูปหลังนับสินค้า (แคปจากหน้า StoreHub)</span>
          <input type="file" accept="image/*" />
        </label>
      </div>
    );
  }

  return null;
}

export function WeeklyStockChecklist({
  phase = weeklyStockSleevePhase
}: {
  phase?: WeeklyStockPhase;
}) {
  const workWeek = formatWorkWeek();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>("");
  const trialMode = !canPersistWorkflowRecords();

  useEffect(() => {
    setChecked(readStore(weeklyCheckedStorageKey) as Record<string, boolean>);
    setDetails(readStore(weeklyDetailStorageKey) as Record<string, string>);
    const storedStatus = readStore(weeklyStatusStorageKey) as Record<string, string>;
    if (storedStatus[detailKey(workWeek, "stocktake-status")]) {
      setStatus(storedStatus[detailKey(workWeek, "stocktake-status")]);
    }
  }, [workWeek]);

  const total = phase.checklist.length;
  const completed = useMemo(
    () => phase.checklist.filter((_, index) => checked[itemKey(workWeek, index)]).length,
    [checked, phase.checklist, workWeek]
  );
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusSubmittable = submittableStocktakeStatuses.includes(
    status as (typeof submittableStocktakeStatuses)[number]
  );
  const canSubmit = completed === total && statusSubmittable;

  function toggleTask(index: number) {
    setChecked((current) => {
      const next = { ...current, [itemKey(workWeek, index)]: !current[itemKey(workWeek, index)] };
      if (canPersistWorkflowRecords()) {
        window.localStorage.setItem(weeklyCheckedStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function updateDetail(key: string, value: string) {
    setDetails((current) => {
      const next = { ...current, [detailKey(workWeek, key)]: value };
      if (canPersistWorkflowRecords()) {
        window.localStorage.setItem(weeklyDetailStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function updateStatus(value: string) {
    setStatus(value);
    if (canPersistWorkflowRecords()) {
      const next = { [detailKey(workWeek, "stocktake-status")]: value };
      window.localStorage.setItem(weeklyStatusStorageKey, JSON.stringify(next));
    }
  }

  function saveProgress() {
    if (!canPersistWorkflowRecords()) return;
    window.localStorage.setItem(weeklyCheckedStorageKey, JSON.stringify(checked));
    window.localStorage.setItem(weeklyDetailStorageKey, JSON.stringify(details));
    window.localStorage.setItem(
      weeklyStatusStorageKey,
      JSON.stringify({ [detailKey(workWeek, "stocktake-status")]: status })
    );
  }

  function submitWork() {
    if (!canSubmit) return;
    saveProgress();
  }

  return (
    <section className="workflow-panel">
      {trialMode ? (
        <div className="trial-banner">
          <strong>โหมดทดลองใช้งาน</strong>
          <span>ทดลองติ๊กและกรอกได้ ข้อมูลจะยังไม่บันทึกเข้า review/dashboard จนกว่าจะเปิดใช้งานจริง</span>
        </div>
      ) : null}
      <div className="runner-status">
        <div>
          <span>ความคืบหน้างานประจำสัปดาห์</span>
          <strong>{progress}%</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-workflow">
        <section id={phase.id} className={`training-card phase-${phase.category}`}>
          <div className="workflow-card-head">
            <span className="phase-icon">{phase.icon}</span>
            <div>
              <p className="eyebrow">{phase.timeLabel}</p>
              <h3>{phase.title}</h3>
            </div>
            <div className="workflow-card-meta">
              <a className="phase-detail-link" href={weeklyStockManualHref()}>รายละเอียด</a>
              <em>{completed}/{total}</em>
            </div>
          </div>
          <p className="phase-window">{phase.scheduleLabel} · {phase.timeLabel}</p>

          <div className="checklist-tick-list">
            {phase.checklist.map((item, index) => {
              const key = itemKey(workWeek, index);
              return (
                <div key={key} className="tick-group has-detail">
                  <label className={checked[key] ? "tick-row done" : "tick-row"}>
                    <input
                      type="checkbox"
                      checked={Boolean(checked[key])}
                      onChange={() => toggleTask(index)}
                    />
                    <span>{item}</span>
                  </label>
                  <WeeklyStockTaskDetails
                    index={index}
                    workWeek={workWeek}
                    status={status}
                    updateStatus={updateStatus}
                    details={details}
                    updateDetail={updateDetail}
                  />
                </div>
              );
            })}
          </div>

          {!statusSubmittable ? (
            <p className="phase-warning">
              Stock Take ใน StoreHub ต้องเป็น In Progress หรือ Completed ก่อนส่งงาน
            </p>
          ) : null}

          <div className="workflow-record-actions">
            <button type="button" className="soft-button" onClick={saveProgress}>
              บันทึก
            </button>
            <button type="button" className="green-button" onClick={submitWork} disabled={!canSubmit}>
              ส่งงาน
            </button>
            <strong className="record-status">{completed}/{total}</strong>
          </div>
        </section>
      </div>
    </section>
  );
}
