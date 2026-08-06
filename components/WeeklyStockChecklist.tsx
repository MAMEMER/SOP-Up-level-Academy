"use client";

import { useMemo } from "react";
import { useWorkRecordWindow } from "../lib/work-records-client.ts";
import { weeklyScopeKey } from "../lib/work-records.ts";
import { SaveIndicator } from "./SaveIndicator.tsx";
import {
  stockRoomSheetUrl,
  stocktakeStatusOptions,
  storehubStocktakesUrl,
  submittableStocktakeStatuses,
  weeklyStockManualHref,
  weeklyStockSleevePhase,
  type WeeklyStockPhase
} from "../lib/weekly-stock-workflow.ts";
import { ChecklistCompleteOverlay, useChecklistCompleteRedirect } from "./ChecklistCompleteRedirect.tsx";
import { applyStringPhaseOverride } from "../lib/checklist-overrides.ts";
import { useChecklistOverrides } from "../lib/checklist-overrides-store.ts";

// Weekly stock is a shared branch task ("ทั้งทีมช่วยกันทำให้ครบในรอบ"), so it is stored
// once per branch per ISO week rather than per person.
type WeeklyStockPayload = {
  checked: Record<string, boolean>;
  details: Record<string, string>;
  status: string;
  submittedAt?: string;
  submittedBy?: string;
};

const emptyWeeklyPayload: WeeklyStockPayload = { checked: {}, details: {}, status: "" };

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
  phase: basePhase = weeklyStockSleevePhase,
  readOnly = false
}: {
  phase?: WeeklyStockPhase;
  readOnly?: boolean;
}) {
  // Owner may reword / add / remove the checklist items at /admin/checklist-config/weekly.
  const overrides = useChecklistOverrides("weekly-stock");
  const phase = useMemo(
    () => applyStringPhaseOverride(basePhase, overrides[basePhase.id]),
    [basePhase, overrides]
  );
  const workWeek = formatWorkWeek();
  const { redirecting, goToDashboard } = useChecklistCompleteRedirect();
  const { data, loaded, status: saveStatus, update } = useWorkRecordWindow<WeeklyStockPayload>({
    scope: "weekly",
    scopeKey: weeklyScopeKey(workWeek),
    owner: "team",
    readOnly,
    empty: emptyWeeklyPayload
  });

  const checked = data.checked || {};
  const details = data.details || {};
  const status = data.status || "";
  const locked = readOnly || !loaded;

  const total = phase.checklist.length;
  const completed = useMemo(
    () => phase.checklist.filter((_, index) => checked[itemKey(workWeek, index)]).length,
    [checked, phase.checklist, workWeek]
  );
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusSubmittable = submittableStocktakeStatuses.includes(
    status as (typeof submittableStocktakeStatuses)[number]
  );
  const canSubmit = !locked && completed === total && statusSubmittable;

  function toggleTask(index: number) {
    if (locked) return;
    const key = itemKey(workWeek, index);
    update((previous) => ({
      ...previous,
      checked: { ...(previous.checked || {}), [key]: !previous.checked?.[key] }
    }));
  }

  function updateDetail(key: string, value: string) {
    if (locked) return;
    update((previous) => ({
      ...previous,
      details: { ...(previous.details || {}), [detailKey(workWeek, key)]: value }
    }));
  }

  function updateStatus(value: string) {
    if (locked) return;
    update((previous) => ({ ...previous, status: value }));
  }

  function submitWork() {
    if (!canSubmit) return;
    update((previous) => ({ ...previous, submittedAt: new Date().toISOString() }));
    // checklist สต๊อกรายสัปดาห์ครบ 100% แล้ว → กลับหน้า Dashboard
    goToDashboard();
  }

  return (
    <section className="workflow-panel">
      <ChecklistCompleteOverlay show={redirecting} />
      {readOnly ? (
        <div className="trial-banner">
          <strong>มุมมองพนักงาน (อ่านอย่างเดียว)</strong>
          <span>ดูข้อมูลจริงได้ แต่แก้ไขไม่ได้</span>
        </div>
      ) : null}
      <div className="runner-status">
        <div>
          <span>ความคืบหน้างานประจำสัปดาห์</span>
          <strong>{progress}%</strong>
        </div>
        <SaveIndicator status={saveStatus} loaded={loaded} />
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
                      disabled={locked}
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
            <button type="button" className="green-button" onClick={submitWork} disabled={!canSubmit}>
              ส่งงาน
            </button>
            <strong className={data.submittedAt ? "record-status submitted" : "record-status"}>
              {data.submittedAt ? "ส่งตรวจแล้ว · " : ""}{completed}/{total}
            </strong>
          </div>
        </section>
      </div>
    </section>
  );
}
