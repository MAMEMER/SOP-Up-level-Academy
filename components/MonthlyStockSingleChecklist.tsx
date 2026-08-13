"use client";

import { useMemo } from "react";
import { useWorkRecordWindow } from "../lib/work-records-client.ts";
import { weeklyScopeKey } from "../lib/work-records.ts";
import { SaveIndicator } from "./SaveIndicator.tsx";
import {
  discrepancyStatusOptions,
  monthlyStockSingleManualHref,
  monthlyStockSinglePhase,
  singleCardGameOptions,
  singleCardStorageAreaOptions,
  storehubStocktakesUrl,
  stocktakeStatusOptions,
  submittableStocktakeStatuses,
  type MonthlyStockSinglePhase
} from "../lib/monthly-stock-single-workflow.ts";
import { ChecklistCompleteOverlay, useChecklistCompleteRedirect } from "./ChecklistCompleteRedirect.tsx";
import { applyStringPhaseOverride, itemsFromStrings, normalizeItemEvidence, resolvePhaseChecklistItems } from "../lib/checklist-overrides.ts";
import { useChecklistOverrides } from "../lib/checklist-overrides-store.ts";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";

// Shared branch task like the weekly count — scoped by ISO week (the completion scope of
// this checklist), stored once for the team rather than per person.
type MonthlySinglePayload = {
  checked: Record<string, boolean>;
  details: Record<string, string>;
  status: string;
  discrepancyStatus: string;
  submittedAt?: string;
};

const emptyMonthlySinglePayload: MonthlySinglePayload = {
  checked: {},
  details: {},
  status: "",
  discrepancyStatus: ""
};

// รหัสสัปดาห์แบบ ISO (เช่น 2026-W30) — Completion scope ของงานนี้เป็นแบบ weekly
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

function itemKey(workScope: string, index: number) {
  return `${workScope}:${index}`;
}

function detailKey(workScope: string, key: string) {
  return `${workScope}:${key}`;
}

// หลักฐานที่เจ้าของตั้งต่อรายการ (รูป/ลิงก์) เก็บใน details map เหมือนหน้า Daily
const evidencePhotoKey = (index: number) => `evidence:${index}:photos`;
const evidenceLinkKey = (index: number) => `evidence:${index}:link`;

function MonthlyStockSingleTaskDetails({
  index,
  workScope,
  status,
  updateStatus,
  discrepancyStatus,
  updateDiscrepancyStatus,
  details,
  updateDetail
}: {
  index: number;
  workScope: string;
  status: string;
  updateStatus: (value: string) => void;
  discrepancyStatus: string;
  updateDiscrepancyStatus: (value: string) => void;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
}) {
  // ขั้น 1 — เลือกเกมและพื้นที่นับ Single card
  if (index === 0) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>เลือกเกมและพื้นที่นับ</strong>
          <small>นับทีละเกม ทีละพื้นที่ ห้ามนับปนกัน · ถ่ายรูป Binder / ตู้ / กล่องก่อนเริ่มนับ</small>
        </div>
        <div className="detail-grid">
          <label className="workflow-note-field compact">
            <span>เกมที่นับ</span>
            <select
              value={details[detailKey(workScope, "game")] || ""}
              onChange={(event) => updateDetail("game", event.target.value)}
            >
              <option value="">เลือกเกม</option>
              {singleCardGameOptions.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>
          </label>
          <label className="workflow-note-field compact">
            <span>พื้นที่ที่นับ</span>
            <select
              value={details[detailKey(workScope, "area")] || ""}
              onChange={(event) => updateDetail("area", event.target.value)}
            >
              <option value="">เลือกพื้นที่</option>
              {singleCardStorageAreaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="detail-grid">
          <label className="workflow-note-field compact">
            <span>ช่วง set / ชุดของการ์ด</span>
            <input
              type="text"
              value={details[detailKey(workScope, "set-range")] || ""}
              onChange={(event) => updateDetail("set-range", event.target.value)}
              placeholder="ตัวอย่าง: SV1–SV5"
            />
          </label>
          <label className="workflow-note-field compact">
            <span>ตู้ / จุดจัดเก็บ</span>
            <input
              type="text"
              value={details[detailKey(workScope, "cabinet")] || ""}
              onChange={(event) => updateDetail("cabinet", event.target.value)}
              placeholder="ตัวอย่าง: ตู้ 2 ชั้นล่าง"
            />
          </label>
        </div>
        <label className="workflow-note-field compact">
          <span>ผู้รับผิดชอบ</span>
          <input
            type="text"
            value={details[detailKey(workScope, "owner")] || ""}
            onChange={(event) => updateDetail("owner", event.target.value)}
            placeholder="ชื่อพนักงานที่นับ"
          />
        </label>
        <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer" className="detail-action-link">
          เปิด StoreHub Stock Take
        </a>
        <label className="detail-upload">
          <span>อัปโหลดรูป Binder / ตู้ / กล่อง Stock ก่อนเริ่มนับ</span>
          <input type="file" accept="image/*" />
        </label>
      </div>
    );
  }

  // ขั้น 2 — นับจำนวนจริงตามตู้โชว์ / Stock (+ สถานะ StoreHub Stock Take)
  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>นับจำนวนจริง · ตู้โชว์ / ห้อง Stock</strong>
          <small>
            เทียบชื่อการ์ด / รหัส จำนวนจริง ตำแหน่งจัดเก็บ และสถานะจอง · การ์ดราคาแพงต้องตรวจชื่อ ภาษา สภาพ
            และจำนวนให้ชัด
          </small>
        </div>
        <div className="detail-grid">
          <label className="detail-check">
            <input
              type="checkbox"
              checked={details[detailKey(workScope, "count-showcase")] === "นับแล้ว"}
              onChange={(event) => updateDetail("count-showcase", event.target.checked ? "นับแล้ว" : "")}
            />
            <span>นับหน้าร้าน (ตู้โชว์)</span>
          </label>
          <label className="detail-check">
            <input
              type="checkbox"
              checked={details[detailKey(workScope, "count-stock-room")] === "นับแล้ว"}
              onChange={(event) => updateDetail("count-stock-room", event.target.checked ? "นับแล้ว" : "")}
            />
            <span>นับห้อง Stock</span>
          </label>
        </div>
        <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer" className="detail-action-link">
          เปิด StoreHub Stock Take
        </a>
        <div className="detail-panel-head">
          <strong>สถานะ StoreHub Stock Take</strong>
          <small>เลือกสถานะให้ตรงกับระบบ · ต้องเป็น In Progress หรือ Completed ก่อนส่งงาน</small>
        </div>
        <div className="segmented-check">
          {stocktakeStatusOptions.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="monthly-single-stocktake-status"
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

  // ขั้น 3 — บันทึกรายการที่ตรงและไม่ตรง
  if (index === 2) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>บันทึกรายการที่ตรงและไม่ตรง</strong>
          <small>รายการที่ไม่ตรงต้องนับซ้ำก่อนส่งสรุป · บันทึกชื่อสินค้าและจำนวนที่เหลือของรายการที่ไม่ตรง</small>
        </div>
        <div className="detail-grid">
          <label className="workflow-note-field compact">
            <span>จำนวน SKU ที่ตรง</span>
            <input
              type="number"
              min={0}
              value={details[detailKey(workScope, "sku-match")] || ""}
              onChange={(event) => updateDetail("sku-match", event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="workflow-note-field compact">
            <span>จำนวน SKU ที่ไม่ตรง</span>
            <input
              type="number"
              min={0}
              value={details[detailKey(workScope, "sku-mismatch")] || ""}
              onChange={(event) => updateDetail("sku-mismatch", event.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <label className="workflow-note-field compact">
          <span>รายการที่ต้องตรวจซ้ำ</span>
          <textarea
            value={details[detailKey(workScope, "recount-list")] || ""}
            onChange={(event) => updateDetail("recount-list", event.target.value)}
            placeholder="ตัวอย่าง: Charizard ex | ต้องนับซ้ำ"
          />
        </label>
        <label className="workflow-note-field compact">
          <span>รายการที่ไม่ตรง (ชื่อสินค้า | จำนวนที่เหลือ)</span>
          <textarea
            value={details[detailKey(workScope, "mismatch-summary")] || ""}
            onChange={(event) => updateDetail("mismatch-summary", event.target.value)}
            placeholder="ตัวอย่าง: Pikachu VMAX | ระบบ 4 / นับจริง 3"
          />
        </label>
        <a href={storehubStocktakesUrl} target="_blank" rel="noreferrer" className="detail-action-link">
          เปิด StoreHub Stock Take
        </a>
      </div>
    );
  }

  // ขั้น 4 — แคปรูปส่งหลักฐานรายการที่ไม่ตรง
  if (index === 3) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แคปรูปหลักฐานรายการที่ไม่ตรง</strong>
          <small>
            ใช้กับการ์ดมูลค่าสูงหรือรายการที่ไม่ตรง · รูปต้องเห็นชื่อการ์ดหรือจุดอ้างอิงพอให้ตรวจย้อนหลังได้
          </small>
        </div>
        <div className="detail-grid">
          <label className="workflow-note-field compact">
            <span>พื้นที่ที่เกี่ยวข้อง</span>
            <select
              value={details[detailKey(workScope, "evidence-area")] || ""}
              onChange={(event) => updateDetail("evidence-area", event.target.value)}
            >
              <option value="">เลือกพื้นที่</option>
              {singleCardStorageAreaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="workflow-note-field compact">
            <span>ประเภทเกมการ์ด</span>
            <select
              value={details[detailKey(workScope, "evidence-game")] || ""}
              onChange={(event) => updateDetail("evidence-game", event.target.value)}
            >
              <option value="">เลือกเกม</option>
              {singleCardGameOptions.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="detail-upload">
          <span>อัปโหลดรูปหลังนับ / จัดเข้าที่ (แคปหน้า StoreHub หรือรูปการ์ด)</span>
          <input type="file" accept="image/*" multiple />
        </label>
      </div>
    );
  }

  // ขั้น 5 — สรุปรายการ +/- โดยต้องให้เจ้าของร้านตรวจ
  if (index === 4) {
    const hasDiscrepancy = discrepancyStatus === "มี";
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สรุปรายการ +/-</strong>
          <small>เลือกสถานะยอดต่าง · ถ้ามีต้องกรอกชื่อสินค้าและจำนวนก่อนส่งงาน</small>
        </div>
        <div className="segmented-check">
          {discrepancyStatusOptions.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="monthly-single-discrepancy-status"
                checked={discrepancyStatus === option}
                onChange={() => updateDiscrepancyStatus(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {hasDiscrepancy ? (
          <>
            <label className="workflow-note-field compact">
              <span>รายการ + (เกินระบบ) · ชื่อสินค้า | จำนวน</span>
              <textarea
                value={details[detailKey(workScope, "plus-list")] || ""}
                onChange={(event) => updateDetail("plus-list", event.target.value)}
                placeholder="ตัวอย่าง: Charizard ex | +1"
              />
            </label>
            <label className="workflow-note-field compact">
              <span>รายการ - (ขาดจากระบบ) · ชื่อสินค้า | จำนวน</span>
              <textarea
                value={details[detailKey(workScope, "minus-list")] || ""}
                onChange={(event) => updateDetail("minus-list", event.target.value)}
                placeholder="ตัวอย่าง: Pikachu VMAX | -1"
              />
            </label>
            <label className="workflow-note-field compact">
              <span>สาเหตุ / รายการที่ต้องให้หัวหน้าตรวจหรืออนุมัติปรับยอด</span>
              <textarea
                value={details[detailKey(workScope, "reason-review")] || ""}
                onChange={(event) => updateDetail("reason-review", event.target.value)}
                placeholder="ตัวอย่าง: การ์ดหายจาก Binder ช่อง 12 — รอหัวหน้าตรวจกล้อง"
              />
            </label>
          </>
        ) : null}
        <p className="phase-warning">ห้ามปรับยอดในระบบก่อนหัวหน้าอนุมัติ</p>
      </div>
    );
  }

  return null;
}

export function MonthlyStockSingleChecklist({
  phase: basePhase = monthlyStockSinglePhase,
  readOnly = false
}: {
  phase?: MonthlyStockSinglePhase;
  readOnly?: boolean;
}) {
  // Owner may reword / add / remove the checklist items at /admin/checklist-config/monthly.
  const overrides = useChecklistOverrides("monthly-stock");
  const phase = useMemo(
    () => applyStringPhaseOverride(basePhase, overrides[basePhase.id]),
    [basePhase, overrides]
  );
  // รายละเอียด/ปุ่มลิงก์ ต่อรายการ (เรียงตรงกับ phase.checklist ที่พนักงานติ๊ก)
  const guideItems = useMemo(
    () => resolvePhaseChecklistItems(itemsFromStrings(basePhase.checklist), overrides[basePhase.id]),
    [basePhase, overrides]
  );
  const workScope = formatWorkWeek();
  const { redirecting, goToDashboard } = useChecklistCompleteRedirect();
  const { data, loaded, status: saveStatus, update } = useWorkRecordWindow<MonthlySinglePayload>({
    scope: "monthly",
    scopeKey: weeklyScopeKey(workScope),
    owner: "team",
    readOnly,
    empty: emptyMonthlySinglePayload
  });

  const checked = data.checked || {};
  const details = data.details || {};
  const status = data.status || "";
  const discrepancyStatus = data.discrepancyStatus || "";
  const locked = readOnly || !loaded;

  const total = phase.checklist.length;
  const completed = useMemo(
    () => phase.checklist.filter((_, index) => checked[itemKey(workScope, index)]).length,
    [checked, phase.checklist, workScope]
  );
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusSubmittable = submittableStocktakeStatuses.includes(
    status as (typeof submittableStocktakeStatuses)[number]
  );
  // หลักฐาน (รูป/ลิงก์) ที่เจ้าของบังคับต่อรายการใด ๆ แต่ยังไม่ได้แนบ → บล็อกปุ่มส่งงาน
  const missingEvidence = useMemo(
    () =>
      phase.checklist
        .map((_, index) => index)
        .filter((index) => {
          const ev = normalizeItemEvidence(guideItems[index]?.evidence);
          if (!ev) return false;
          const photoMissing =
            ev.kinds.includes("photo") && !(details[detailKey(workScope, evidencePhotoKey(index))] || "").trim();
          const linkMissing =
            ev.kinds.includes("link") && !(details[detailKey(workScope, evidenceLinkKey(index))] || "").trim();
          return photoMissing || linkMissing;
        }),
    [phase.checklist, guideItems, details, workScope]
  );
  // ถ้ามีรายการ +/- ต้องกรอกรายละเอียด (+, - หรือ สาเหตุ) อย่างน้อยหนึ่งช่องก่อนส่งงาน
  const discrepancyResolved =
    discrepancyStatus === "ไม่มี" ||
    (discrepancyStatus === "มี" &&
      Boolean(
        (details[detailKey(workScope, "plus-list")] || "").trim() ||
          (details[detailKey(workScope, "minus-list")] || "").trim() ||
          (details[detailKey(workScope, "reason-review")] || "").trim()
      ));
  const canSubmit =
    !locked && completed === total && statusSubmittable && discrepancyResolved && missingEvidence.length === 0;

  function toggleTask(index: number) {
    if (locked) return;
    const key = itemKey(workScope, index);
    update((previous) => ({
      ...previous,
      checked: { ...(previous.checked || {}), [key]: !previous.checked?.[key] }
    }));
  }

  function updateDetail(key: string, value: string) {
    if (locked) return;
    update((previous) => ({
      ...previous,
      details: { ...(previous.details || {}), [detailKey(workScope, key)]: value }
    }));
  }

  function updateStatus(value: string) {
    if (locked) return;
    update((previous) => ({ ...previous, status: value }));
  }

  function updateDiscrepancyStatus(value: string) {
    if (locked) return;
    update((previous) => ({ ...previous, discrepancyStatus: value }));
  }

  function submitWork() {
    if (!canSubmit) return;
    update((previous) => ({ ...previous, submittedAt: new Date().toISOString() }));
    // checklist นับสต๊อกรายเดือนครบ 100% แล้ว → กลับหน้า Dashboard
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
          <span>ความคืบหน้างานประจำเดือน</span>
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
              <a className="phase-detail-link" href={monthlyStockSingleManualHref()}>รายละเอียด</a>
              <em>{completed}/{total}</em>
            </div>
          </div>
          <p className="phase-window">
            {phase.scheduleLabel} · {phase.timeLabel}
            {phase.shiftLabel ? ` · กะที่รับผิดชอบ: ${phase.shiftLabel}` : ""}
          </p>

          <div className="checklist-tick-list">
            {phase.checklist.map((item, index) => {
              const key = itemKey(workScope, index);
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
                  <MonthlyStockSingleTaskDetails
                    index={index}
                    workScope={workScope}
                    status={status}
                    updateStatus={updateStatus}
                    discrepancyStatus={discrepancyStatus}
                    updateDiscrepancyStatus={updateDiscrepancyStatus}
                    details={details}
                    updateDetail={updateDetail}
                  />
                  {(() => {
                    const ev = normalizeItemEvidence(guideItems[index]?.evidence);
                    if (!ev) return null;
                    return (
                      <div className="detail-panel">
                        <div className="detail-panel-head">
                          <strong>หลักฐาน</strong>
                          <small>{ev.note?.trim() || "แนบหลักฐานหลังทำรายการนี้เสร็จ"}</small>
                        </div>
                        {ev.kinds.includes("photo") ? (
                          <div className="detail-upload">
                            <span>อัปโหลดรูป (สูงสุด 3 รูป)</span>
                            <EvidencePhotosInput
                              value={details[detailKey(workScope, evidencePhotoKey(index))] || ""}
                              onChange={(value) => updateDetail(evidencePhotoKey(index), value)}
                              disabled={locked}
                              max={3}
                            />
                          </div>
                        ) : null}
                        {ev.kinds.includes("link") ? (
                          <label className="workflow-note-field compact">
                            <span>แนบลิงก์</span>
                            <input
                              type="url"
                              inputMode="url"
                              value={details[detailKey(workScope, evidenceLinkKey(index))] || ""}
                              disabled={locked}
                              onChange={(event) => updateDetail(evidenceLinkKey(index), event.target.value)}
                              placeholder="วางลิงก์หลักฐาน"
                            />
                          </label>
                        ) : null}
                      </div>
                    );
                  })()}
                  <ChecklistItemGuide note={guideItems[index]?.note} links={guideItems[index]?.links} />
                </div>
              );
            })}
          </div>

          {!statusSubmittable ? (
            <p className="phase-warning">
              Stock Take ใน StoreHub ต้องเป็น In Progress หรือ Completed ก่อนส่งงาน
            </p>
          ) : null}
          {discrepancyStatus === "มี" && !discrepancyResolved ? (
            <p className="phase-warning">
              มีรายการ +/- ต้องกรอกชื่อสินค้าและจำนวนก่อนส่งงาน
            </p>
          ) : null}
          {missingEvidence.length ? (
            <p className="phase-warning">แนบหลักฐาน (รูป/ลิงก์) ให้ครบทุกรายการที่กำหนดก่อนส่งงาน</p>
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
