"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { workflowManualHref, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  canAdminUnlockWorkflowRecord,
  canEditWorkflowRecord,
  emptyWorkflowDayPayload,
  formatWorkDate,
  isPhaseDayClosed,
  isPhaseNotYetOpen,
  isPhaseUnlocked,
  isPhasePastDue,
  isWithinWorkflowWorkHours,
  mergeDayMaps,
  phaseScheduleForWorkDate,
  recordsFromDayPayloads,
  shouldAutoMissWorkflowRecord,
  upsertWorkflowRecord,
  WORKFLOW_HISTORY_DAYS,
  type WorkflowDailyRecord,
  type WorkflowDayPayload,
  type WorkflowRecordStatus
} from "../lib/workflow-records.ts";
import { evidenceForItem, guideForItem, type ChecklistEvidence, type ChecklistGuides, type PhaseWindows } from "../lib/daily-checklist.ts";
import { ChecklistItemGuide } from "./ChecklistItemGuide.tsx";
import { ChecklistCompleteOverlay, useChecklistCompleteRedirect } from "./ChecklistCompleteRedirect.tsx";
import { useWorkRecordWindow } from "../lib/work-records-client.ts";
import { SaveIndicator } from "./SaveIndicator.tsx";
import { logSubmitPress } from "../lib/submit-log-client.ts";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { dailyScopeKey, shiftWorkDate } from "../lib/work-records.ts";

function itemKey(phaseId: string, index: number) {
  return `${phaseId}:${index}`;
}

// รายการของหัวข้อ built-in บางข้อมี detail panel เฉพาะทาง (รูปเงินสด, เลข track ฯลฯ) เขียนไว้ในโค้ด
// อยู่แล้ว — หลักฐานที่ owner ตั้งเองจะแสดงเฉพาะรายการที่ยังไม่มี panel พวกนี้ เพื่อไม่ให้ซ้ำซ้อน
function itemHasHardcodedDetail(phaseId: string, index: number) {
  return (
    phaseId === "open-store" ||
    phaseId === "guild-chat-exp" ||
    phaseId === "stock-work" ||
    (phaseId === "daytime-work" && index <= 2) ||
    (phaseId === "close-store" && index <= 4)
  );
}

const evidencePhotoKey = (phaseId: string, index: number) => `evidence:${phaseId}:${index}:photos`;
const evidenceLinkKey = (phaseId: string, index: number) => `evidence:${phaseId}:${index}:link`;

function noOrderKeyForPhase(phase: WorkflowPhase) {
  const index = phase.checklist.findIndex((item) => item === "ไม่มีออเดอร์");
  return index >= 0 ? itemKey(phase.id, index) : undefined;
}

function completedCountForPhase(phase: WorkflowPhase, checkedMap: Record<string, boolean>) {
  const noOrderKey = noOrderKeyForPhase(phase);
  if (noOrderKey && checkedMap[noOrderKey]) return phase.checklist.length;
  return phase.checklist.filter((_, index) => checkedMap[itemKey(phase.id, index)]).length;
}

const stockRoomSheetUrl = "https://docs.google.com/spreadsheets/d/1hZcCPfbjEsKTVnLxSrb75HnPdv8ZcGQyvaB5BEa5Vyk/edit?gid=0#gid=0";
const supplyNeedsUrl = "https://uplevel.storehubhq.com/stocks/supplyNeeds/v2/web";

function noteKey(workDate: string, phaseId: string) {
  return `${workDate}:${phaseId}`;
}

function detailKey(workDate: string, key: string) {
  return `${workDate}:${key}`;
}

function previousWorkDateKey(workDate: string) {
  const date = new Date(`${workDate}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const guildAdminUrl = "https://guild.uplevelguild.com/admin";

function GuildChatExpTaskDetails({ index }: { index: number }) {
  return (
    <div className="detail-panel">
      <div className="detail-panel-head">
        <strong>{index === 0 ? "แชทค้าง" : "Exp / เควสต์ค้าง"}</strong>
        <small>
          {index === 0
            ? "ตอบแชทลูกค้าที่ค้างจากเมื่อวานให้หมดก่อนเริ่มงานอื่น"
            : "อนุมัติคำขอ Exp และเควสต์ที่รออยู่ อย่าปล่อยค้างข้ามวัน"}
        </small>
      </div>
      <a href={guildAdminUrl} target="_blank" rel="noreferrer" className="detail-action-link">
        เปิดหน้าแอดมินเว็บกิลด์
      </a>
    </div>
  );
}

function OpenStoreTaskDetails({
  index,
  canEdit,
  userEmail,
  workDate,
  details,
  updateDetail
}: {
  index: number;
  canEdit: boolean;
  userEmail: string;
  workDate: string;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
}) {
  if (index === 0) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>POS login</strong>
          <small>ใช้อีเมลเดียวกับ StoreHub</small>
        </div>
        <label className="workflow-note-field compact">
          <span>อีเมลที่บันทึก</span>
          <input
            type="text"
            value={details[detailKey(workDate, "pos-login")] || userEmail}
            readOnly
            disabled={!canEdit}
            onFocus={() => updateDetail("pos-login", userEmail)}
          />
        </label>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>ไฟ / แอร์</strong>
          <small>เปิดตามลำดับ ลดใช้ไฟเกินจำเป็น</small>
        </div>
        <div className="detail-grid">
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
            <span>ไฟ / แอร์ 1 / เน็ต</span>
          </label>
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
            <span>แอร์ 2 ก่อนเปิด 15 นาที</span>
          </label>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>มาตรฐานความสะอาด</strong>
          <small>โต๊ะ เคาน์เตอร์ ชั้นวาง ทางเดิน ต้องโล่งและสะอาด</small>
        </div>
        <div className="detail-upload">
          <span>อัปโหลดรูปหลังทำเสร็จ (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "open-clean-photos")] || ""}
            onChange={(value) => updateDetail("open-clean-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 3) {
    const previousCloseDate = previousWorkDateKey(workDate);
    const previousClosingCash = details[detailKey(previousCloseDate, "closing-cash-total")];

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>เงินสด</strong>
          <small>เทียบกับยอดปิดร้านเมื่อวานจากข้อมูลปิดยอดร้าน</small>
        </div>
        <p>{previousClosingCash ? `ยอดปิดร้านเมื่อวาน: ${previousClosingCash} บาท` : "ยังไม่มีข้อมูลปิดยอดร้านเมื่อวาน"}</p>
        <div className="segmented-check">
          <label>
            <input
              type="radio"
              name="cash-check"
              checked={details[detailKey(workDate, "cash-check")] === "ตรง"}
              disabled={!canEdit}
              onChange={() => updateDetail("cash-check", "ตรง")}
            />
            <span>ตรง</span>
          </label>
          <label>
            <input
              type="radio"
              name="cash-check"
              checked={details[detailKey(workDate, "cash-check")] === "ไม่ตรง"}
              disabled={!canEdit}
              onChange={() => updateDetail("cash-check", "ไม่ตรง")}
            />
            <span>ไม่ตรง</span>
          </label>
        </div>
        {details[detailKey(workDate, "cash-check")] === "ไม่ตรง" ? (
          <a href="/monthly-summary" className="detail-link">ส่งบัญชีตรวจ</a>
        ) : null}
        <div className="detail-upload">
          <span>อัปโหลดรูปเงินสด (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "open-cash-photos")] || ""}
            onChange={(value) => updateDetail("open-cash-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แชตค้าง</strong>
          <small>ตอบแชทลูกค้าที่ค้างให้จบก่อน 12.00</small>
        </div>
        <label className="detail-check">
          <input type="checkbox" disabled={!canEdit} />
          <span>ตอบแชทลูกค้าครบก่อน 12.00</span>
        </label>
      </div>
    );
  }

  if (index === 5) {
    const refillGroups = ["น้ำ,ขนม", "ชั้นแขวน อุปกรณ์", "การ์ด Booster box"] as const;

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สินค้าเหลือน้อย</strong>
          <small>เติมบนชั้นให้พร้อมขาย</small>
        </div>
        <div className="detail-grid">
          {refillGroups.map((group) => {
            const key = `open-shelf-refill-${group.toLowerCase().replaceAll(" ", "-").replaceAll(",", "-")}`;
            return (
              <label key={group} className="detail-check">
                <input
                  type="checkbox"
                  checked={details[detailKey(workDate, key)] === "เติมแล้ว"}
                  disabled={!canEdit}
                  onChange={(event) => updateDetail(key, event.target.checked ? "เติมแล้ว" : "")}
                />
                <span>{group}</span>
              </label>
            );
          })}
        </div>
        <div className="detail-upload">
          <span>อัปโหลดรูปหลังเติมสินค้า (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "open-shelf-refill-photos")] || ""}
            onChange={(value) => updateDetail("open-shelf-refill-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 6) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สินค้าใหม่</strong>
          <small>ติดราคาและนำออกขาย</small>
        </div>
        <div className="detail-grid">
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
            <span>ติดราคาแล้ว</span>
          </label>
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
            <span>นำออกขายแล้ว</span>
          </label>
        </div>
      </div>
    );
  }

  return null;
}

function ShippingTaskDetails({
  index,
  canEdit,
  workDate,
  details,
  noOrder,
  updateDetail,
  onNoOrderChange
}: {
  index: number;
  canEdit: boolean;
  workDate: string;
  details: Record<string, string>;
  noOrder: boolean;
  updateDetail: (key: string, value: string) => void;
  onNoOrderChange: (isNoOrder: boolean) => void;
}) {
  if (index === 0) {
    const channels = ["Facebook", "IG", "Line group", "Shopee"] as const;

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>ช่องทางออเดอร์</strong>
          <small>ถ้าวันนี้ไม่มีออเดอร์ต้องส่ง ให้ติ๊ก “ไม่มีออเดอร์” เพื่อข้ามขั้นตอนที่เหลือและกดส่งงานได้เลย</small>
        </div>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={noOrder}
            disabled={!canEdit}
            onChange={(event) => onNoOrderChange(event.target.checked)}
          />
          <span>ไม่มีออเดอร์</span>
        </label>
        <div className="detail-grid">
          {channels.map((channel) => {
            const key = `shipping-channel-${channel.toLowerCase().replaceAll(" ", "-")}`;
            return (
              <label key={channel} className="detail-check">
                <input
                  type="checkbox"
                  checked={!noOrder && details[detailKey(workDate, key)] === "มี"}
                  disabled={!canEdit || noOrder}
                  onChange={(event) => updateDetail(key, event.target.checked ? "มี" : "")}
                />
                <span>{channel}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>จำนวนออเดอร์ทั้งหมดที่ต้องส่ง</strong>
          <small>ใส่จำนวนรวมก่อนเริ่มแพ็คสินค้า</small>
        </div>
        <label className="workflow-note-field compact">
          <span>จำนวนออเดอร์ทั้งหมดที่ต้องส่ง</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={noOrder ? "" : details[detailKey(workDate, "shipping-total-order-count")] || ""}
            disabled={!canEdit || noOrder}
            onChange={(event) => updateDetail("shipping-total-order-count", event.target.value)}
            placeholder="เช่น 12"
          />
        </label>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แพ็คและจัดส่ง</strong>
          <small>แพ็คสินค้าตามขั้นตอน แล้วเพิ่ม record เลข track เมื่อจัดส่งแล้ว</small>
        </div>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={!noOrder && details[detailKey(workDate, "shipping-dispatched-with-tracking-record")] === "เรียบร้อย"}
            disabled={!canEdit || noOrder}
            onChange={(event) => updateDetail("shipping-dispatched-with-tracking-record", event.target.checked ? "เรียบร้อย" : "")}
          />
          <span>จัดส่งสินค้าพร้อมเพิ่ม record เลข track</span>
        </label>
        <label className="workflow-note-field compact">
          <span>เลข track</span>
          <textarea
            value={noOrder ? "" : details[detailKey(workDate, "shipping-tracking-number")] || ""}
            disabled={!canEdit || noOrder}
            onChange={(event) => updateDetail("shipping-tracking-number", event.target.value)}
            placeholder="กรอกเลข tracking หลังจัดส่ง"
          />
        </label>
      </div>
    );
  }

  return null;
}

function CloseStoreTaskDetails({
  index,
  canEdit,
  workDate,
  details,
  updateDetail,
  onNoOrderChange
}: {
  index: number;
  canEdit: boolean;
  workDate: string;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
  onNoOrderChange: (isNoOrder: boolean) => void;
}) {
  if (index === 0) {
    const noOrder = details[detailKey(workDate, "closing-no-order")] === "ไม่มีออเดอร์";
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แพ็คออเดอร์ที่ค้าง</strong>
          <small>ถ้าไม่มีออเดอร์ค้าง ให้ติ๊ก “ไม่มีออเดอร์” เพื่อข้ามการแพ็คและอัปโหลดรูป</small>
        </div>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={noOrder}
            disabled={!canEdit}
            onChange={(event) => onNoOrderChange(event.target.checked)}
          />
          <span>ไม่มีออเดอร์</span>
        </label>
        <label className="workflow-note-field compact">
          <span>จำนวนออเดอร์ที่ค้าง</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={noOrder ? "" : details[detailKey(workDate, "closing-order-count")] || ""}
            disabled={!canEdit || noOrder}
            onChange={(event) => updateDetail("closing-order-count", event.target.value)}
            placeholder="เช่น 8"
          />
        </label>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={!noOrder && details[detailKey(workDate, "closing-admin-next-day-shipping")] === "แจ้งแล้ว"}
            disabled={!canEdit || noOrder}
            onChange={(event) => updateDetail("closing-admin-next-day-shipping", event.target.checked ? "แจ้งแล้ว" : "")}
          />
          <span>แจ้งในกลุ่มแอดมินเพื่อส่งของในวันพรุ่งนี้</span>
        </label>
        <div className="detail-upload">
          <span>อัปโหลดรูปแพ็คออเดอร์ที่ค้าง (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={noOrder ? "" : details[detailKey(workDate, "closing-pack-order-photos")] || ""}
            onChange={(value) => updateDetail("closing-pack-order-photos", value)}
            disabled={!canEdit || noOrder}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>เก็บอุปกรณ์ ทำความสะอาดพื้นที่เล่น</strong>
          <small>แนบรูปหลักฐานหลังเก็บพื้นที่และอุปกรณ์เรียบร้อย</small>
        </div>
        <div className="detail-upload">
          <span>อัปโหลดรูปหลักฐานทำความสะอาด (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "closing-clean-photos")] || ""}
            onChange={(value) => updateDetail("closing-clean-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>ปิดยอดร้าน</strong>
          <small>บันทึกยอดเงินสดปิดร้าน เพื่อใช้เทียบตอนเปิดร้านวันถัดไป</small>
        </div>
        <label className="workflow-note-field compact">
          <span>ยอดเงินสดปิดร้าน</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={details[detailKey(workDate, "closing-cash-total")] || ""}
            disabled={!canEdit}
            onChange={(event) => updateDetail("closing-cash-total", event.target.value)}
            placeholder="เช่น 4775"
          />
        </label>
        <div className="detail-upload">
          <span>อัปโหลดรูปเงินสดปิดร้าน (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "closing-cash-photos")] || ""}
            onChange={(value) => updateDetail("closing-cash-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แจ้งสรุปประจำวันในกลุ่มแอดมิน</strong>
          <small>ส่งยอดรวม ปัญหา และงานที่ต้องติดตามในกลุ่มแอดมิน</small>
        </div>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={details[detailKey(workDate, "closing-admin-daily-summary")] === "แจ้งแล้ว"}
            disabled={!canEdit}
            onChange={(event) => updateDetail("closing-admin-daily-summary", event.target.checked ? "แจ้งแล้ว" : "")}
          />
          <span>แจ้งสรุปประจำวันในกลุ่มแอดมิน</span>
        </label>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>งานส่งต่อกะถัดไป</strong>
          <small>สรุปงานที่กะเปิดร้านวันถัดไปต้องทำต่อ ให้เห็นก่อนออกจากร้าน</small>
        </div>
        <label className="workflow-note-field compact">
          <span>สรุปงานส่งต่อให้กะเปิดร้านวันถัดไป</span>
          <textarea
            value={details[detailKey(workDate, "closing-handoff-summary")] || ""}
            disabled={!canEdit}
            onChange={(event) => updateDetail("closing-handoff-summary", event.target.value)}
            placeholder="ตัวอย่าง: ส่งออเดอร์ Shopee 3 กล่องเช้าพรุ่งนี้, ลูกค้าฝากการ์ดไว้ 1 ใบ, เติมน้ำเปล่า 2 แพ็ค"
          />
        </label>
        <a href="/handoff" className="detail-action-link">เปิดหน้า งานส่งต่อ (Handoff)</a>
      </div>
    );
  }

  return null;
}

type SupplyNeedItem = { name: string; remaining: number; reorderPoint?: number; unit?: string };
type SupplyNeedsState =
  | { status: "loading" }
  | { status: "not_configured" }
  | { status: "error"; detail?: string }
  | { status: "ready"; items: SupplyNeedItem[]; fetchedAt: string };

function formatFetchedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

// แจ้งเตือนสินค้าใกล้หมดแบบอัตโนมัติ: ดึงจาก StoreHub Supply Needs feed ผ่าน API
// พนักงานเห็นรายการที่ต้องสั่งได้เลย ไม่ต้อง copy CSV มาวาง. ถ้ายังไม่ได้ตั้งค่า feed
// จะแสดงคำแนะนำให้เปิด StoreHub เอง(fallback) — ไม่พังของเดิม.
function SupplyNeedsAlert({ canEdit, onUseSummary }: { canEdit: boolean; onUseSummary: (summary: string) => void }) {
  const [state, setState] = useState<SupplyNeedsState>({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/storehub/supply-needs", { cache: "no-store" });
      if (res.status === 503) {
        setState({ status: "not_configured" });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", detail: typeof body.detail === "string" ? body.detail : undefined });
        return;
      }
      const body = await res.json();
      const items: SupplyNeedItem[] = Array.isArray(body.items) ? body.items : [];
      setState({ status: "ready", items, fetchedAt: typeof body.fetchedAt === "string" ? body.fetchedAt : "" });
    } catch (error) {
      setState({ status: "error", detail: error instanceof Error ? error.message : undefined });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (state.status === "loading") {
    return <p className="detail-hint">กำลังดึงรายการสินค้าใกล้หมดจาก StoreHub...</p>;
  }

  if (state.status === "not_configured") {
    return <p className="detail-hint">ยังไม่ได้ตั้งค่าดึงอัตโนมัติ — เปิด StoreHub Supply Needs แล้วสรุปรายการด้านล่างเอง</p>;
  }

  if (state.status === "error") {
    return (
      <div className="supply-alert">
        <p className="detail-hint">ดึงอัตโนมัติไม่สำเร็จ — เปิด StoreHub เองได้ หรือกดลองใหม่</p>
        <button type="button" className="supply-alert-button" onClick={() => void load()}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="supply-alert">
        <p className="detail-hint">
          ตอนนี้ไม่มีสินค้าที่ใกล้หมด{state.fetchedAt ? ` (อัปเดต ${formatFetchedAt(state.fetchedAt)})` : ""}
        </p>
        <button type="button" className="supply-alert-button" onClick={() => void load()}>
          รีเฟรช
        </button>
      </div>
    );
  }

  const summary = state.items
    .map((item) => `${item.name} | ${item.remaining}${item.unit ? ` ${item.unit}` : ""}`)
    .join("\n");

  return (
    <div className="supply-alert">
      <div className="supply-alert-head">
        <strong>สินค้าใกล้หมด {state.items.length} รายการ — ต้องสั่งเพิ่ม</strong>
        {state.fetchedAt ? <small>อัปเดต {formatFetchedAt(state.fetchedAt)}</small> : null}
      </div>
      <ul className="supply-alert-list">
        {state.items.map((item) => (
          <li key={`${item.name}-${item.remaining}`}>
            <span className="supply-alert-name">{item.name}</span>
            <span className="supply-alert-qty">
              เหลือ {item.remaining}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="supply-alert-actions">
        <button type="button" className="supply-alert-button" onClick={() => onUseSummary(summary)} disabled={!canEdit}>
          ใช้รายการนี้เป็นสรุป
        </button>
        <button type="button" className="supply-alert-button ghost" onClick={() => void load()}>
          รีเฟรช
        </button>
      </div>
    </div>
  );
}

function StockTaskDetails({
  index,
  canEdit,
  workDate,
  details,
  updateDetail,
  note,
  updateNote
}: {
  index: number;
  canEdit: boolean;
  workDate: string;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
  note: string;
  updateNote: (value: string) => void;
}) {
  if (index === 0) {
    const stocktakeStatus = details[detailKey(workDate, "stocktake-status")];

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>StoreHub Stock Take</strong>
          <small>ดึงข้อมูลจาก session ล่าสุด และ approve เฉพาะสถานะ Completed</small>
        </div>
        <div className="segmented-check">
          {["In Progress", "Completed", "Cancelled"].map((status) => (
            <label key={status}>
              <input
                type="radio"
                name="stocktake-status"
                checked={stocktakeStatus === status}
                disabled={!canEdit}
                onChange={() => updateDetail("stocktake-status", status)}
              />
              <span>{status}</span>
            </label>
          ))}
        </div>
        <p className="detail-hint">
          {stocktakeStatus === "In Progress" || stocktakeStatus === "Completed" ? "พร้อมส่งงานตามสถานะ StoreHub Stock Take" : "เลือกสถานะ StoreHub Stock Take เป็น In Progress หรือ Completed ก่อนส่งงาน"}
        </p>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>พื้นที่ที่นับ</strong>
          <small>ต้องนับทั้งของหน้าร้านและของสำรอง</small>
        </div>
        <div className="detail-grid">
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
            <span>จำนวนหน้าร้าน</span>
          </label>
          <label className="detail-check">
            <input type="checkbox" disabled={!canEdit} />
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
          <strong>แจ้งเตือนสินค้าใกล้หมด</strong>
          <small>แนบรูปหน้าจอ StoreHub Supply Needs ได้เลย (เร็วและแม่นกว่า) หรือจะพิมพ์สรุปเองก็ได้</small>
        </div>
        <SupplyNeedsAlert canEdit={canEdit} onUseSummary={(summary) => updateDetail("supply-needs-summary", summary)} />
        <a href={supplyNeedsUrl} target="_blank" rel="noreferrer" className="detail-action-link">
          เปิด StoreHub Supply Needs
        </a>
        <label className="detail-check">
          <input
            type="checkbox"
            checked={details[detailKey(workDate, "stock-low-none")] === "ไม่มี"}
            disabled={!canEdit}
            onChange={(event) => updateDetail("stock-low-none", event.target.checked ? "ไม่มี" : "")}
          />
          <span>ไม่มี</span>
        </label>
        <div className="detail-upload">
          <span>แนบรูปหน้าจอสินค้าใกล้หมด (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "supply-needs-photos")] || ""}
            onChange={(value) => updateDetail("supply-needs-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
        <label className="workflow-note-field compact">
          <span>หรือพิมพ์สรุป: ชื่อสินค้า | จำนวนที่เหลือ (ไม่บังคับถ้าแนบรูปแล้ว)</span>
          <textarea
            value={details[detailKey(workDate, "supply-needs-summary")] || ""}
            disabled={!canEdit}
            onChange={(event) => updateDetail("supply-needs-summary", event.target.value)}
            placeholder="ชื่อสินค้า | จำนวนที่เหลือ"
          />
        </label>
      </div>
    );
  }

  if (index === 3) {
    const refillGroups = ["น้ำ,ขนม", "ชั้นแขวน อุปกรณ์", "การ์ด Booster box"] as const;

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>เติมสินค้าบนชั้น</strong>
          <small>เลือกพื้นที่ที่เติมและอัปโหลดรูปหลังเติมเสร็จ</small>
        </div>
        <div className="detail-grid">
          {refillGroups.map((group) => {
            const key = `stock-shelf-refill-${group.toLowerCase().replaceAll(" ", "-").replaceAll(",", "-")}`;
            return (
              <label key={group} className="detail-check">
                <input
                  type="checkbox"
                  checked={details[detailKey(workDate, key)] === "เติมแล้ว"}
                  disabled={!canEdit}
                  onChange={(event) => updateDetail(key, event.target.checked ? "เติมแล้ว" : "")}
                />
                <span>{group}</span>
              </label>
            );
          })}
        </div>
        <div className="detail-upload">
          <span>อัปโหลดรูปหลังเติมสินค้า (สูงสุด 3 รูป)</span>
          <EvidencePhotosInput
            value={details[detailKey(workDate, "stock-refill-photos")] || ""}
            onChange={(value) => updateDetail("stock-refill-photos", value)}
            disabled={!canEdit}
            max={3}
          />
        </div>
      </div>
    );
  }

  if (index === 4) {
    const reorderStatus = details[detailKey(workDate, "stock-reorder-status")];
    const requiresList = reorderStatus === "มี";

    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>รายการที่ต้องสั่งเพิ่ม</strong>
          <small>ถ้ามี ต้องใส่ชื่อสินค้าและจำนวนก่อนส่งงาน</small>
        </div>
        <div className="segmented-check">
          <label>
            <input
              type="radio"
              name="stock-reorder-status"
              checked={reorderStatus === "ไม่มี"}
              disabled={!canEdit}
              onChange={() => updateDetail("stock-reorder-status", "ไม่มี")}
            />
            <span>ไม่มี</span>
          </label>
          <label>
            <input
              type="radio"
              name="stock-reorder-status"
              checked={requiresList}
              disabled={!canEdit}
              onChange={() => updateDetail("stock-reorder-status", "มี")}
            />
            <span>มี</span>
          </label>
        </div>
        {requiresList ? (
          <label className="workflow-note-field compact">
            <span>รายการและจำนวน</span>
            <textarea
              value={note}
              disabled={!canEdit}
              onChange={(event) => updateNote(event.target.value)}
              placeholder="ตัวอย่าง: น้ำดื่ม 4 แพ็ค, ทิวลี่ 3 กล่อง"
            />
          </label>
        ) : null}
      </div>
    );
  }

  return null;
}

export function WorkflowChecklist({
  phases,
  userEmail,
  userRole,
  shift = null,
  windows,
  evidence,
  guides,
  readOnly = false
}: {
  phases: WorkflowPhase[];
  userEmail: string;
  userRole: "employee" | "leader" | "admin";
  /** Today's shift for this staffer — only used for labelling now, not for the window. */
  shift?: "s1" | "s2" | null;
  /** Owner-configured submit window per หัวข้อ (/admin/checklist-config). */
  windows?: PhaseWindows;
  /** Owner-configured หลักฐาน (รูป/ลิงก์) that a checklist item must attach (/admin/checklist-config). */
  evidence?: ChecklistEvidence;
  /** Owner-configured รายละเอียด + ปุ่มลิงก์ shown under a checklist item (/admin/checklist-config). */
  guides?: ChecklistGuides;
  /** Admin previewing another account — render everything, save nothing. */
  readOnly?: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => new Date());
  const checklistPhases = useMemo(() => phases.filter((phase) => phase.checklist.length > 0), [phases]);
  const visiblePhaseIds = useMemo(() => checklistPhases.map((phase) => phase.id), [checklistPhases]);
  const workDate = formatWorkDate();
  // Locked = ยังไม่ถึงเวลาเปิด (ปิดร้าน) หรือหมดวันแล้ว. เลยเวลากำหนดแต่ยังไม่หมดวัน = ส่งได้
  // แต่นับเป็นสาย (-2) — ไม่ได้ล็อกเหมือนของเดิม
  const scheduleContext = { windows, shift };
  const phaseLockedNow = (phaseId: string) =>
    isPhaseNotYetOpen(phaseId, workDate, now, scheduleContext) || isPhaseDayClosed(phaseId, workDate, now, scheduleContext);
  const scopeKey = dailyScopeKey(workDate);
  const fromScopeKey = dailyScopeKey(shiftWorkDate(workDate, -WORKFLOW_HISTORY_DAYS));

  // Server-persisted day record: today's is writable, the previous days are read for
  // on-time streaks and the "ยอดปิดร้านเมื่อวาน" lookup.
  const { data, history, loaded, status, update, flush } = useWorkRecordWindow<WorkflowDayPayload>({
    scope: "daily",
    scopeKey,
    fromScopeKey,
    toScopeKey: scopeKey,
    readOnly,
    empty: emptyWorkflowDayPayload
  });

  const previousDays = useMemo(
    () => history.filter((doc) => doc.scopeKey !== scopeKey).map((doc) => doc.data as Partial<WorkflowDayPayload>),
    [history, scopeKey]
  );
  const todayRecords = useMemo(() => data.records || [], [data.records]);
  const records = useMemo(
    () => recordsFromDayPayloads([...previousDays, { records: todayRecords }]),
    [previousDays, todayRecords]
  );
  const notes = useMemo(
    () => mergeDayMaps([...previousDays.map((day) => day.notes), data.notes]),
    [previousDays, data.notes]
  );
  const details = useMemo(
    () => mergeDayMaps([...previousDays.map((day) => day.details), data.details]),
    [previousDays, data.details]
  );

  const total = useMemo(() => checklistPhases.reduce((sum, phase) => sum + phase.checklist.length, 0), [checklistPhases]);
  const completed = checklistPhases.reduce((sum, phase) => sum + completedCountForPhase(phase, checked), 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isAdmin = userRole === "admin";
  const withinWorkHours = isWithinWorkflowWorkHours(now);
  const locked = readOnly || !loaded;
  const { redirecting, goToDashboard } = useChecklistCompleteRedirect();
  // หัวข้อที่กำลังส่ง / หัวข้อที่ส่งแล้วไม่ถึงระบบ — น้องต้องเห็นชัดว่ากดติดหรือไม่ติด
  const [submitting, setSubmitting] = useState("");
  const [failedSubmit, setFailedSubmit] = useState<Record<string, boolean>>({});

  function updateRecords(next: WorkflowDailyRecord[]) {
    update((previous) => ({ ...previous, records: next }));
  }

  // Hydrate today's ticks ONCE, when the record first loads. Re-running this on every
  // record change would fight the user: each tick writes a record, which would bounce the
  // checkbox back to the server copy mid-interaction.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || hydratedFor.current === workDate) return;
    hydratedFor.current = workDate;
    setChecked(
      Object.fromEntries(
        todayRecords
          .filter((record) => record.workDate === workDate)
          .flatMap((record) => (record.checkedKeys || []).map((key) => [key, true]))
      )
    );
  }, [loaded, todayRecords, workDate]);

  // The POS-login detail always mirrors the signed-in email.
  useEffect(() => {
    if (!loaded || readOnly) return;
    const key = detailKey(workDate, "pos-login");
    if (data.details?.[key] === userEmail) return;
    update((previous) => ({
      ...previous,
      details: { ...(previous.details || {}), [key]: userEmail }
    }));
  }, [loaded, readOnly, userEmail, workDate, data.details, update]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  // A phase whose window closed without a submission is recorded as "missed" — that's the
  // signal the KPI checklist category deducts from, so it has to be written, not derived.
  useEffect(() => {
    if (!loaded || readOnly) return;
    const next = checklistPhases.reduce((current, phase) => {
      const existing = current.find((record) => record.workDate === workDate && record.phaseId === phase.id);
      if (!shouldAutoMissWorkflowRecord(existing, phase.id, workDate, now, scheduleContext)) return current;

      const schedule = phaseScheduleForWorkDate(phase.id, workDate, scheduleContext);
      return upsertWorkflowRecord(current, {
        workDate,
        phaseId: phase.id,
        phaseTitle: phase.title,
        completed: existing?.completed || 0,
        total: phase.checklist.length,
        status: "missed",
        recordedAt: now.toISOString(),
        startedAt: existing?.startedAt,
        dueAt: schedule.dueAt,
        scheduleStartAt: schedule.startAt,
        scheduleEndAt: schedule.endAt,
        checkedKeys: existing?.checkedKeys || []
      });
    }, todayRecords);

    if (next !== todayRecords) updateRecords(next);
    // updateRecords is stable via update(); listing it would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistPhases, loaded, now, readOnly, todayRecords, workDate]);

  function persistPhaseRecord(phase: WorkflowPhase, recordStatus: WorkflowRecordStatus, checkedMap: Record<string, boolean>) {
    if (locked) return;
    const existing = todayRecords.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours()) return;
    if (!canEditWorkflowRecord(existing, { adminOverride: isAdmin })) return;
    if (phaseLockedNow(phase.id) && !isAdmin) return;

    const noOrderKey = noOrderKeyForPhase(phase);
    const checkedKeys = phase.checklist.map((_, index) => itemKey(phase.id, index)).filter((key) => {
      if (!checkedMap[key]) return false;
      return !noOrderKey || key === noOrderKey || !checkedMap[noOrderKey];
    });
    const phaseCompleted = completedCountForPhase(phase, checkedMap);
    if (recordStatus === "submitted" && phaseCompleted < phase.checklist.length) return;

    const recordedAt = new Date().toISOString();
    const schedule = phaseScheduleForWorkDate(phase.id, workDate, scheduleContext);
    // ส่งซ้ำต้องไม่เลื่อนเวลาส่งให้ช้าลง (server ก็บังคับอีกชั้นใน /api/work-records)
    const reopened =
      existing?.adminUnlockedAt &&
      existing.submittedAt &&
      Date.parse(existing.adminUnlockedAt) > Date.parse(existing.submittedAt);
    const submittedAt = !reopened && existing?.submittedAt ? existing.submittedAt : recordedAt;
    const next = upsertWorkflowRecord(todayRecords, {
      workDate,
      phaseId: phase.id,
      phaseTitle: phase.title,
      completed: phaseCompleted,
      total: phase.checklist.length,
      status: recordStatus,
      recordedAt,
      startedAt: existing?.startedAt || recordedAt,
      dueAt: schedule.dueAt,
      scheduleStartAt: schedule.startAt,
      scheduleEndAt: schedule.endAt,
      checkedKeys,
      submittedAt: recordStatus === "submitted" ? submittedAt : undefined,
      adminUnlockedAt: existing?.adminUnlockedAt,
      adminUnlockedBy: existing?.adminUnlockedBy
    });
    updateRecords(next);
    if (recordStatus !== "submitted") return;

    // กดส่งงานต้องรอให้ถึง server จริงก่อน. เดิมเด้งกลับหน้า Dashboard ทันทีที่กด ทั้งที่การ
    // บันทึกยังเป็น debounce 700ms อยู่ — พอหน้าถูก unmount timer ก็ถูกล้าง งานที่กดไปแล้ว
    // จึงไม่เคยถึงระบบ ("น้องบอกกดมาแล้วแต่ไม่ขึ้น")
    setSubmitting(phase.id);
    const pressedAt = recordedAt;
    void flush().then((ok) => {
      // บันทึกการกดไว้เสมอ แม้รอบนี้บันทึกงานไม่สำเร็จ — เจ้าของร้านต้องตรวจย้อนได้
      logSubmitPress({ workDate, phaseId: phase.id, phaseTitle: phase.title, pressedAt, ok });
      setSubmitting((current) => (current === phase.id ? "" : current));
      setFailedSubmit((current) => {
        const nextFailed = { ...current };
        if (ok) delete nextFailed[phase.id];
        else nextFailed[phase.id] = true;
        return nextFailed;
      });
      if (!ok) return;

      // ส่งครบทุกหัวข้อของวันแล้ว → กลับหน้า Dashboard ให้เอง
      const allSubmitted =
        checklistPhases.length > 0 &&
        checklistPhases.every(
          (item) =>
            next.find((record) => record.workDate === workDate && record.phaseId === item.id)?.status ===
            "submitted"
        );
      if (allSubmitted) goToDashboard();
    });
  }

  function recordPhase(phase: WorkflowPhase, recordStatus: WorkflowRecordStatus) {
    persistPhaseRecord(phase, recordStatus, checked);
  }

  function toggleTask(phase: WorkflowPhase, key: string) {
    if (locked) return;
    const record = todayRecords.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours(now)) return;
    if (phaseLockedNow(phase.id) && !isAdmin) return;
    if (!canEditWorkflowRecord(record, { adminOverride: isAdmin }) || !isPhaseUnlocked(phase.id, workDate, records, visiblePhaseIds)) return;

    const next = { ...checked, [key]: !checked[key] };
    const noOrderKey = noOrderKeyForPhase(phase);
    if (noOrderKey && key === noOrderKey && next[key]) {
      phase.checklist.forEach((_, index) => {
        const currentKey = itemKey(phase.id, index);
        if (currentKey !== noOrderKey) next[currentKey] = false;
      });
    }
    if (noOrderKey && key !== noOrderKey && next[key]) {
      next[noOrderKey] = false;
    }

    setChecked(next);
    // Every tick is written, not just the first one — a half-finished phase that the staff
    // member never submits still has to survive a refresh.
    persistPhaseRecord(phase, record?.status === "submitted" ? "submitted" : "saved", next);
  }

  function updateNote(phaseId: string, value: string) {
    if (locked) return;
    update((previous) => ({
      ...previous,
      notes: { ...(previous.notes || {}), [noteKey(workDate, phaseId)]: value }
    }));
  }

  function updateDetail(key: string, value: string) {
    if (locked) return;
    update((previous) => ({
      ...previous,
      details: { ...(previous.details || {}), [detailKey(workDate, key)]: value }
    }));
  }

  // "ไม่มีออเดอร์" สำหรับกะปิดร้าน: ข้ามเฉพาะข้อแพ็คออเดอร์ (ข้อแรก) โดยไม่ข้ามทั้ง phase
  // ทำให้ส่งงานได้เมื่อไม่มีออเดอร์ค้าง แต่ยังต้องทำงานปิดร้านอื่นครบ (เก็บของ ปิดยอด ล็อกร้าน)
  function setCloseStoreNoOrder(phase: WorkflowPhase, isNoOrder: boolean) {
    const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours(now)) return;
    if (phaseLockedNow(phase.id) && !isAdmin) return;
    if (!canEditWorkflowRecord(record, { adminOverride: isAdmin }) || !isPhaseUnlocked(phase.id, workDate, records, visiblePhaseIds)) return;

    updateDetail("closing-no-order", isNoOrder ? "ไม่มีออเดอร์" : "");
    if (isNoOrder) {
      // เคลียร์รายละเอียดออเดอร์ที่ไม่จำเป็นแล้ว
      updateDetail("closing-order-count", "");
      updateDetail("closing-admin-next-day-shipping", "");
    }
    const key = itemKey(phase.id, 0);
    setChecked((current) => {
      const next = { ...current, [key]: isNoOrder };
      if (!record) persistPhaseRecord(phase, "saved", next);
      return next;
    });
  }

  // "ไม่มีออเดอร์" สำหรับหัวข้อจัดส่งสินค้า (daytime-work): ทั้ง phase เป็นงานเกี่ยวกับออเดอร์
  // เมื่อไม่มีออเดอร์ต้องส่ง → ติ๊กทุกข้ออัตโนมัติ ข้ามขั้นตอนที่เหลือ ให้กดส่งงานได้เลย
  function setDaytimeNoOrder(phase: WorkflowPhase, isNoOrder: boolean) {
    const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours(now)) return;
    if (phaseLockedNow(phase.id) && !isAdmin) return;
    if (!canEditWorkflowRecord(record, { adminOverride: isAdmin }) || !isPhaseUnlocked(phase.id, workDate, records, visiblePhaseIds)) return;

    updateDetail("shipping-no-order", isNoOrder ? "ไม่มีออเดอร์" : "");
    if (isNoOrder) {
      // เคลียร์รายละเอียดออเดอร์ที่ไม่จำเป็นแล้ว
      updateDetail("shipping-total-order-count", "");
      updateDetail("shipping-dispatched-with-tracking-record", "");
      updateDetail("shipping-tracking-number", "");
    }
    setChecked((current) => {
      const next = { ...current };
      phase.checklist.forEach((_, index) => {
        next[itemKey(phase.id, index)] = isNoOrder;
      });
      if (!record) persistPhaseRecord(phase, "saved", next);
      return next;
    });
  }

  function unlockPhaseForAdmin(phase: WorkflowPhase) {
    if (!isAdmin || locked) return;
    const existing = todayRecords.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!canAdminUnlockWorkflowRecord(existing, phase.id, workDate, now, scheduleContext)) return;

    const unlockedAt = new Date().toISOString();
    const schedule = phaseScheduleForWorkDate(phase.id, workDate, scheduleContext);
    const checkedKeys = existing?.checkedKeys || [];
    updateRecords(
      upsertWorkflowRecord(todayRecords, {
        workDate,
        phaseId: phase.id,
        phaseTitle: phase.title,
        completed: existing?.completed || 0,
        total: phase.checklist.length,
        status: "saved",
        recordedAt: unlockedAt,
        startedAt: existing?.startedAt || unlockedAt,
        dueAt: schedule.dueAt,
        scheduleStartAt: schedule.startAt,
        scheduleEndAt: schedule.endAt,
        checkedKeys,
        adminUnlockedAt: unlockedAt,
        adminUnlockedBy: userEmail
      })
    );
    setChecked((current) => ({
      ...current,
      ...Object.fromEntries(checkedKeys.map((key) => [key, true]))
    }));
  }

  function stockReorderListMissing(phase: WorkflowPhase) {
    if (phase.id !== "stock-work") return false;
    return (
      details[detailKey(workDate, "stock-reorder-status")] === "มี" &&
      !notes[noteKey(workDate, phase.id)]?.trim()
    );
  }

  function missingStockTakeApproval(phase: WorkflowPhase) {
    if (phase.id !== "stock-work") return false;
    const status = details[detailKey(workDate, "stocktake-status")];
    return status !== "In Progress" && status !== "Completed";
  }

  function missingHandoffSummary(phase: WorkflowPhase) {
    if (phase.id !== "close-store") return false;
    return !details[detailKey(workDate, "closing-handoff-summary")]?.trim();
  }

  /** Owner-required หลักฐาน (รูป/ลิงก์) ที่ยังไม่ได้แนบในหัวข้อนี้ — บล็อกปุ่มส่งงานจนกว่าจะครบ. */
  function missingEvidenceItems(phase: WorkflowPhase): string[] {
    return phase.checklist
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        if (itemHasHardcodedDetail(phase.id, index)) return false;
        const req = evidenceForItem(evidence, phase.id, item);
        if (!req) return false;
        const photoMissing =
          req.kinds.includes("photo") && !(details[detailKey(workDate, evidencePhotoKey(phase.id, index))] || "").trim();
        const linkMissing =
          req.kinds.includes("link") && !(details[detailKey(workDate, evidenceLinkKey(phase.id, index))] || "").trim();
        return photoMissing || linkMissing;
      })
      .map(({ item }) => item);
  }

  return (
    <section className="workflow-panel">
      <ChecklistCompleteOverlay show={redirecting} />
      {readOnly ? (
        <div className="trial-banner">
          <strong>มุมมองพนักงาน (อ่านอย่างเดียว)</strong>
          <span>กำลังดูข้อมูลจริงของพนักงานคนนี้ ติ๊กหรือส่งงานไม่ได้ เพื่อไม่ให้กระทบคะแนนของเขา</span>
        </div>
      ) : null}
      {!withinWorkHours ? (
        <div className="time-lock-banner">
          <strong>นอกเวลาทำงาน</strong>
          <span>สามารถทำ checklist ได้เฉพาะเวลา 09:00-23:59 เท่านั้น</span>
        </div>
      ) : null}
      <div className="runner-status">
        <div>
          <span>ความคืบหน้าทั้งวัน</span>
          <strong>{progress}%</strong>
        </div>
        <SaveIndicator status={status} loaded={loaded} />
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-workflow">
        {checklistPhases.map((phase) => {
          const done = completedCountForPhase(phase, checked);
          const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
          const isSubmitted = record?.status === "submitted";
          const unlocked = isPhaseUnlocked(phase.id, workDate, records, visiblePhaseIds);
          const isLate = !isSubmitted && isPhasePastDue(phase.id, workDate, now, scheduleContext);
          const notYetOpen = isPhaseNotYetOpen(phase.id, workDate, now, scheduleContext);
          const dayClosed = isPhaseDayClosed(phase.id, workDate, now, scheduleContext);
          const adminUnlocked = Boolean(record?.adminUnlockedAt);
          const canEdit = !locked && withinWorkHours && canEditWorkflowRecord(record, { adminOverride: isAdmin }) && unlocked && (isAdmin || (!notYetOpen && !dayClosed));
          const missingStockReorderList = stockReorderListMissing(phase);
          const missingStockTakeStatus = missingStockTakeApproval(phase);
          const missingHandoff = missingHandoffSummary(phase);
          const missingEvidence = missingEvidenceItems(phase);
          const previousHandoff =
            phase.id === "open-store"
              ? (details[detailKey(previousWorkDateKey(workDate), "closing-handoff-summary")] || "").trim()
              : "";
          const canSubmit =
            canEdit &&
            done === phase.checklist.length &&
            !missingStockReorderList &&
            !missingStockTakeStatus &&
            !missingHandoff &&
            missingEvidence.length === 0;
          const canAdminUnlock = isAdmin && unlocked && canAdminUnlockWorkflowRecord(record, phase.id, workDate, now, scheduleContext) && !adminUnlocked && !locked;
          const schedule = phaseScheduleForWorkDate(phase.id, workDate, scheduleContext);
          return (
            <section key={phase.id} id={phase.id} className={`training-card phase-${phase.category}`}>
              <div className="workflow-card-head">
                <span className="phase-icon">{phase.icon}</span>
                <div>
                  <p className="eyebrow">
                    {schedule.hasOpenTime ? `ส่งได้ ${schedule.startLabel}-${schedule.dueLabel}` : `ส่งภายใน ${schedule.dueLabel}`}
                  </p>
                  <h3>{phase.title}</h3>
                </div>
                <div className="workflow-card-meta">
                  <a className="phase-detail-link" href={workflowManualHref(phase.id)}>รายละเอียด</a>
                  <em>{done}/{phase.checklist.length}</em>
                </div>
              </div>
              {previousHandoff ? (
                <div className="handoff-inbox">
                  <p className="eyebrow">งานส่งต่อจากกะปิดร้านเมื่อวาน</p>
                  <p>{previousHandoff}</p>
                </div>
              ) : null}
              {readOnly ? null : (
                <p className="phase-window">
                  {schedule.hasOpenTime
                    ? `ส่งได้ตั้งแต่ ${schedule.startLabel} ถึง ${schedule.dueLabel}`
                    : `กำหนดส่ง ${schedule.dueLabel} — ทำหัวข้อไหนก่อนก็ได้`}
                  {notYetOpen ? ` · ยังไม่ถึงเวลา เริ่มได้ ${schedule.startLabel}` : ""}
                  {isLate && !dayClosed ? " · เลยเวลาแล้ว ส่งได้อยู่ แต่หัก 2 คะแนน" : ""}
                  {dayClosed && !isSubmitted ? " · หมดวันแล้ว ส่งไม่ได้" : ""}
                  {record?.submittedAt && record.dueAt && Date.parse(record.submittedAt) > Date.parse(record.dueAt)
                    ? " · ส่งสาย หัก 2 คะแนน"
                    : ""}
                  {adminUnlocked ? " · admin ปลดล็อคให้แก้ไข" : ""}
                  {!withinWorkHours ? " · นอกเวลาทำงาน 09:00-23:59" : ""}
                </p>
              )}
              <div className="checklist-tick-list">
                {phase.checklist.map((item, index) => {
                  const key = itemKey(phase.id, index);
                  const noOrderKey = noOrderKeyForPhase(phase);
                  const closeNoOrderActive =
                    phase.id === "close-store" && details[detailKey(workDate, "closing-no-order")] === "ไม่มีออเดอร์";
                  const daytimeNoOrderActive =
                    phase.id === "daytime-work" && details[detailKey(workDate, "shipping-no-order")] === "ไม่มีออเดอร์";
                  const disabledByNoOrder =
                    Boolean(noOrderKey && checked[noOrderKey] && key !== noOrderKey) ||
                    (closeNoOrderActive && index === 0) ||
                    daytimeNoOrderActive;
                  const hasDetail = itemHasHardcodedDetail(phase.id, index);
                  // หลักฐานที่ owner ตั้งไว้ที่ /admin/checklist-config — แสดงเฉพาะรายการที่ไม่มี panel เฉพาะทางอยู่แล้ว
                  const itemEvidence = hasDetail ? undefined : evidenceForItem(evidence, phase.id, item);
                  // รายละเอียด + ปุ่มลิงก์ ที่ owner ตั้งไว้ — แสดงได้กับทุกรายการ (ไม่ชนกับ panel เฉพาะทาง)
                  const itemGuide = guideForItem(guides, phase.id, item);
                  return (
                    <div key={key} className={hasDetail || itemEvidence || itemGuide ? "tick-group has-detail" : "tick-group"}>
                      <label
                        className={`${checked[key] ? "tick-row done" : "tick-row"}${canEdit && !disabledByNoOrder ? "" : " locked"}`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(checked[key])}
                          disabled={!canEdit || disabledByNoOrder}
                          onChange={() => toggleTask(phase, key)}
                        />
                        <span>{item}</span>
                      </label>
                      {hasDetail ? (
                        <>
                          {phase.id === "open-store" ? (
                            <OpenStoreTaskDetails
                              index={index}
                              canEdit={canEdit}
                              userEmail={userEmail}
                              workDate={workDate}
                              details={details}
                              updateDetail={updateDetail}
                            />
                          ) : null}
                          {phase.id === "guild-chat-exp" ? <GuildChatExpTaskDetails index={index} /> : null}
                          {phase.id === "stock-work" ? (
                            <StockTaskDetails
                              index={index}
                              canEdit={canEdit}
                              workDate={workDate}
                              details={details}
                              updateDetail={updateDetail}
                              note={notes[noteKey(workDate, phase.id)] || ""}
                              updateNote={(value) => updateNote(phase.id, value)}
                            />
                          ) : null}
                          {phase.id === "daytime-work" ? (
                            <ShippingTaskDetails
                              index={index}
                              canEdit={canEdit}
                              workDate={workDate}
                              details={details}
                              noOrder={daytimeNoOrderActive}
                              updateDetail={updateDetail}
                              onNoOrderChange={(isNoOrder) => setDaytimeNoOrder(phase, isNoOrder)}
                            />
                          ) : null}
                          {phase.id === "close-store" ? (
                            <CloseStoreTaskDetails
                              index={index}
                              canEdit={canEdit}
                              workDate={workDate}
                              details={details}
                              updateDetail={updateDetail}
                              onNoOrderChange={(isNoOrder) => setCloseStoreNoOrder(phase, isNoOrder)}
                            />
                          ) : null}
                        </>
                      ) : itemEvidence ? (
                        <div className="detail-panel">
                          <div className="detail-panel-head">
                            <strong>หลักฐาน</strong>
                            <small>{itemEvidence.note?.trim() || "แนบหลักฐานหลังทำรายการนี้เสร็จ"}</small>
                          </div>
                          {itemEvidence.kinds.includes("photo") ? (
                            <div className="detail-upload">
                              <span>อัปโหลดรูป (สูงสุด 3 รูป)</span>
                              <EvidencePhotosInput
                                value={details[detailKey(workDate, evidencePhotoKey(phase.id, index))] || ""}
                                onChange={(value) => updateDetail(evidencePhotoKey(phase.id, index), value)}
                                disabled={!canEdit || disabledByNoOrder}
                                max={3}
                              />
                            </div>
                          ) : null}
                          {itemEvidence.kinds.includes("link") ? (
                            <label className="workflow-note-field compact">
                              <span>แนบลิงก์</span>
                              <input
                                type="url"
                                inputMode="url"
                                value={details[detailKey(workDate, evidenceLinkKey(phase.id, index))] || ""}
                                disabled={!canEdit || disabledByNoOrder}
                                onChange={(event) => updateDetail(evidenceLinkKey(phase.id, index), event.target.value)}
                                placeholder="วางลิงก์ เช่น ลิงก์โพสต์กิจกรรม"
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      <ChecklistItemGuide note={itemGuide?.note} links={itemGuide?.links} />
                    </div>
                  );
                })}
              </div>
              {missingStockReorderList ? (
                <p className="phase-warning">กรอกรายการและจำนวนที่ต้องสั่งเพิ่มก่อนส่งงาน</p>
              ) : null}
              {missingStockTakeStatus ? (
                <p className="phase-warning">StoreHub Stock Take ต้องเป็น In Progress หรือ Completed ก่อนส่งงาน Stock</p>
              ) : null}
              {missingHandoff ? (
                <p className="phase-warning">กรอกสรุปงานส่งต่อให้กะเปิดร้านวันถัดไปก่อนส่งงาน</p>
              ) : null}
              {missingEvidence.length ? (
                <p className="phase-warning">แนบหลักฐานให้ครบก่อนส่งงาน: {missingEvidence.join(", ")}</p>
              ) : null}
              <div className="workflow-record-actions">
                <button type="button" className="soft-button" onClick={() => recordPhase(phase, "saved")} disabled={!canEdit}>
                  บันทึก
                </button>
                {canAdminUnlock ? (
                  <button type="button" className="soft-button warning" onClick={() => unlockPhaseForAdmin(phase)}>
                    ปลดล็อคให้แก้ไข
                  </button>
                ) : null}
                <button
                  type="button"
                  className="green-button"
                  onClick={() => recordPhase(phase, "submitted")}
                  disabled={!canSubmit || submitting === phase.id}
                >
                  {submitting === phase.id ? "กำลังส่ง…" : failedSubmit[phase.id] ? "ส่งอีกครั้ง" : "ส่งงาน"}
                </button>
                {record ? (
                  <strong className={isSubmitted ? "record-status submitted" : "record-status"}>
                    {isSubmitted ? "ส่งตรวจแล้ว" : record.status === "missed" ? "หมดเวลาแล้ว" : "บันทึกแล้ว"} · {record.completed}/{record.total}
                  </strong>
                ) : null}
              </div>
              {failedSubmit[phase.id] ? (
                <p className="phase-submit-failed">
                  ยังส่งไม่ถึงระบบ — งานนี้ยังไม่ถูกบันทึก เช็คอินเทอร์เน็ตแล้วกด “ส่งอีกครั้ง” อย่าเพิ่งปิดหน้านี้
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
