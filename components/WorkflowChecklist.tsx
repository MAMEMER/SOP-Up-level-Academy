"use client";

import { useEffect, useMemo, useState } from "react";
import { workflowManualHref, type WorkflowPhase } from "../lib/card-store-workflow.ts";
import {
  canAdminUnlockWorkflowRecord,
  canEditWorkflowRecord,
  formatWorkDate,
  isFlexibleWorkflowPhase,
  isPhaseUnlocked,
  isPhasePastDue,
  isWithinWorkflowWorkHours,
  phaseScheduleForWorkDate,
  readWorkflowRecordsFromStorage,
  shouldAutoMissWorkflowRecord,
  upsertWorkflowRecord,
  canPersistWorkflowRecords,
  workflowStorageKey,
  type WorkflowDailyRecord,
  type WorkflowRecordStatus
} from "../lib/workflow-records.ts";

function itemKey(phaseId: string, index: number) {
  return `${phaseId}:${index}`;
}

function noOrderKeyForPhase(phase: WorkflowPhase) {
  const index = phase.checklist.findIndex((item) => item === "ไม่มีออเดอร์");
  return index >= 0 ? itemKey(phase.id, index) : undefined;
}

function completedCountForPhase(phase: WorkflowPhase, checkedMap: Record<string, boolean>) {
  const noOrderKey = noOrderKeyForPhase(phase);
  if (noOrderKey && checkedMap[noOrderKey]) return phase.checklist.length;
  return phase.checklist.filter((_, index) => checkedMap[itemKey(phase.id, index)]).length;
}

const workflowNoteStorageKey = "up-level-workflow-notes";
const workflowDetailStorageKey = "up-level-workflow-details";
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

function readWorkflowNotes() {
  if (!canPersistWorkflowRecords()) return {};
  const stored = window.localStorage.getItem(workflowNoteStorageKey);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    window.localStorage.removeItem(workflowNoteStorageKey);
    return {};
  }
}

function readWorkflowDetails() {
  if (!canPersistWorkflowRecords()) return {};
  const stored = window.localStorage.getItem(workflowDetailStorageKey);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    window.localStorage.removeItem(workflowDetailStorageKey);
    return {};
  }
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
        <label className="detail-upload">
          <span>อัปโหลดรูปหลังทำเสร็จ</span>
          <input type="file" accept="image/*" disabled={!canEdit} />
        </label>
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
        <label className="detail-upload">
          <span>อัปโหลดรูปเงินสด</span>
          <input type="file" accept="image/*" disabled={!canEdit} />
        </label>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>แชตค้าง</strong>
          <small>ตอบข้อความหลังปิดกะเมื่อวานให้จบก่อน 12:00</small>
        </div>
        <label className="detail-check">
          <input type="checkbox" disabled={!canEdit} />
          <span>ตอบครบก่อน 12:00</span>
        </label>
      </div>
    );
  }

  if (index === 5) {
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>สินค้าเหลือน้อย</strong>
          <small>เติมบนชั้นให้พร้อมขาย</small>
        </div>
        <label className="detail-check">
          <input type="checkbox" disabled={!canEdit} />
          <span>เติมแล้ว</span>
        </label>
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

function CloseStoreTaskDetails({
  index,
  canEdit,
  workDate,
  details,
  updateDetail
}: {
  index: number;
  canEdit: boolean;
  workDate: string;
  details: Record<string, string>;
  updateDetail: (key: string, value: string) => void;
}) {
  if (index === 4) {
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
        <label className="detail-upload">
          <span>อัปโหลดรูปเงินสดปิดร้าน</span>
          <input type="file" accept="image/*" disabled={!canEdit} />
        </label>
      </div>
    );
  }

  return null;
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
          {stocktakeStatus === "Completed" ? "พร้อม approve ตามสถานะ StoreHub Stock Take" : "รอ StoreHub Stock Take เป็น Completed ก่อนส่งงาน"}
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
          <small>สรุปรายวันจาก StoreHub Supply Needs เฉพาะชื่อสินค้าและจำนวนที่เหลือ</small>
        </div>
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
        <label className="workflow-note-field compact">
          <span>สรุปรายวัน: ชื่อสินค้า | จำนวนที่เหลือ</span>
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
    return (
      <div className="detail-panel">
        <div className="detail-panel-head">
          <strong>หลักฐานหลังตรวจเสร็จ</strong>
          <small>อัปโหลดรูปหรือแคปหน้าจอหลังทำรายการเสร็จสิ้น</small>
        </div>
        <label className="detail-upload">
          <span>อัปโหลดภาพ</span>
          <input type="file" accept="image/*" disabled={!canEdit} />
        </label>
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
  userRole
}: {
  phases: WorkflowPhase[];
  userEmail: string;
  userRole: "employee" | "leader" | "admin";
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState<WorkflowDailyRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const checklistPhases = useMemo(() => phases.filter((phase) => phase.checklist.length > 0), [phases]);
  const workDate = formatWorkDate();
  const total = useMemo(() => checklistPhases.reduce((sum, phase) => sum + phase.checklist.length, 0), [checklistPhases]);
  const completed = checklistPhases.reduce((sum, phase) => sum + completedCountForPhase(phase, checked), 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isAdmin = userRole === "admin";
  const trialMode = !canPersistWorkflowRecords();
  const withinWorkHours = isWithinWorkflowWorkHours(now);

  useEffect(() => {
    const currentTime = new Date();
    const storedRecords = readWorkflowRecordsFromStorage(window.localStorage);
    if (storedRecords.length > 0) {
      const recordsWithMissed = checklistPhases.reduce((current, phase) => {
        const existing = current.find((record) => record.workDate === workDate && record.phaseId === phase.id);
        if (!shouldAutoMissWorkflowRecord(existing, phase.id, workDate, currentTime)) return current;

        const schedule = phaseScheduleForWorkDate(phase.id, workDate);
        return upsertWorkflowRecord(current, {
          workDate,
          phaseId: phase.id,
          phaseTitle: phase.title,
          completed: existing?.completed || 0,
          total: phase.checklist.length,
          status: "missed",
          recordedAt: currentTime.toISOString(),
          startedAt: existing?.startedAt,
          dueAt: schedule.dueAt,
          scheduleStartAt: schedule.startAt,
          scheduleEndAt: schedule.endAt,
          checkedKeys: existing?.checkedKeys || []
        });
      }, storedRecords);
      const restoredChecked = Object.fromEntries(
        recordsWithMissed
          .filter((record) => record.workDate === workDate)
          .flatMap((record) => (record.checkedKeys || []).map((key) => [key, true]))
      );
      setRecords(recordsWithMissed);
      setChecked(restoredChecked);
      if (canPersistWorkflowRecords() && recordsWithMissed !== storedRecords) {
        window.localStorage.setItem(workflowStorageKey, JSON.stringify(recordsWithMissed));
      }
    } else {
      const missedRecords = checklistPhases.reduce((current, phase) => {
        if (!shouldAutoMissWorkflowRecord(undefined, phase.id, workDate, currentTime)) return current;
        const schedule = phaseScheduleForWorkDate(phase.id, workDate);
        return upsertWorkflowRecord(current, {
          workDate,
          phaseId: phase.id,
          phaseTitle: phase.title,
          completed: 0,
          total: phase.checklist.length,
          status: "missed",
          recordedAt: currentTime.toISOString(),
          dueAt: schedule.dueAt,
          scheduleStartAt: schedule.startAt,
          scheduleEndAt: schedule.endAt,
          checkedKeys: []
        });
      }, [] as WorkflowDailyRecord[]);

      if (missedRecords.length > 0) {
        setRecords(missedRecords);
        if (canPersistWorkflowRecords()) {
          window.localStorage.setItem(workflowStorageKey, JSON.stringify(missedRecords));
        }
      }
    }
  }, [checklistPhases, workDate]);

  useEffect(() => {
    setNotes(readWorkflowNotes());
    setDetails(readWorkflowDetails());
  }, []);

  useEffect(() => {
    setDetails((current) => {
      const key = detailKey(workDate, "pos-login");
      if (current[key] === userEmail) return current;
      const next = { ...current, [key]: userEmail };
      if (canPersistWorkflowRecords()) {
        window.localStorage.setItem(workflowDetailStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }, [userEmail, workDate]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setRecords((current) => {
      const next = checklistPhases.reduce((recordsSoFar, phase) => {
        const existing = recordsSoFar.find((record) => record.workDate === workDate && record.phaseId === phase.id);
        if (!shouldAutoMissWorkflowRecord(existing, phase.id, workDate, now)) return recordsSoFar;

        const schedule = phaseScheduleForWorkDate(phase.id, workDate);
        return upsertWorkflowRecord(recordsSoFar, {
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
      }, current);

      if (next !== current) {
        if (canPersistWorkflowRecords()) {
          window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
        }
      }
      return next;
    });
  }, [checklistPhases, now, workDate]);

  function persistPhaseRecord(phase: WorkflowPhase, status: WorkflowRecordStatus, checkedMap: Record<string, boolean>) {
    const existing = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours()) return;
    if (!canEditWorkflowRecord(existing, { adminOverride: isAdmin })) return;
    if (isPhasePastDue(phase.id, workDate) && !isFlexibleWorkflowPhase(phase.id) && !isAdmin) return;

    const noOrderKey = noOrderKeyForPhase(phase);
    const checkedKeys = phase.checklist.map((_, index) => itemKey(phase.id, index)).filter((key) => {
      if (!checkedMap[key]) return false;
      return !noOrderKey || key === noOrderKey || !checkedMap[noOrderKey];
    });
    const phaseCompleted = completedCountForPhase(phase, checkedMap);
    if (status === "submitted" && phaseCompleted < phase.checklist.length) return;

    const now = new Date().toISOString();
    const schedule = phaseScheduleForWorkDate(phase.id, workDate);
    const next = upsertWorkflowRecord(records, {
      workDate,
      phaseId: phase.id,
      phaseTitle: phase.title,
      completed: phaseCompleted,
      total: phase.checklist.length,
      status,
      recordedAt: now,
      startedAt: existing?.startedAt || now,
      dueAt: schedule.dueAt,
      scheduleStartAt: schedule.startAt,
      scheduleEndAt: schedule.endAt,
      checkedKeys,
      submittedAt: status === "submitted" ? now : undefined,
      adminUnlockedAt: existing?.adminUnlockedAt,
      adminUnlockedBy: existing?.adminUnlockedBy
    });
    setRecords(next);
    if (canPersistWorkflowRecords()) {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
    }
  }

  function recordPhase(phase: WorkflowPhase, status: WorkflowRecordStatus) {
    persistPhaseRecord(phase, status, checked);
  }

  function toggleTask(phase: WorkflowPhase, key: string) {
    const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!isWithinWorkflowWorkHours(now)) return;
    if (isPhasePastDue(phase.id, workDate) && !isFlexibleWorkflowPhase(phase.id) && !isAdmin) return;
    if (!canEditWorkflowRecord(record, { adminOverride: isAdmin }) || !isPhaseUnlocked(phase.id, workDate, records)) return;
    setChecked((current) => {
      const next = { ...current, [key]: !current[key] };
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
      if (!record) persistPhaseRecord(phase, "saved", next);
      return next;
    });
  }

  function updateNote(phaseId: string, value: string) {
    setNotes((current) => {
      const next = { ...current, [noteKey(workDate, phaseId)]: value };
      if (canPersistWorkflowRecords()) {
        window.localStorage.setItem(workflowNoteStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function updateDetail(key: string, value: string) {
    setDetails((current) => {
      const next = { ...current, [detailKey(workDate, key)]: value };
      if (canPersistWorkflowRecords()) {
        window.localStorage.setItem(workflowDetailStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function unlockPhaseForAdmin(phase: WorkflowPhase) {
    if (!isAdmin) return;
    const existing = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
    if (!canAdminUnlockWorkflowRecord(existing, phase.id, workDate, now)) return;

    const unlockedAt = new Date().toISOString();
    const schedule = phaseScheduleForWorkDate(phase.id, workDate);
    const checkedKeys = existing?.checkedKeys || [];
    const next = upsertWorkflowRecord(records, {
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
    });
    setRecords(next);
    setChecked((current) => ({
      ...current,
      ...Object.fromEntries(checkedKeys.map((key) => [key, true]))
    }));
    if (canPersistWorkflowRecords()) {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify(next));
    }
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
    return details[detailKey(workDate, "stocktake-status")] !== "Completed";
  }

  return (
    <section className="workflow-panel">
      {trialMode ? (
        <div className="trial-banner">
          <strong>โหมดทดลองใช้งาน</strong>
          <span>ทดลองติ๊กและแก้ไขได้ ข้อมูลจะยังไม่บันทึกเข้า review/dashboard จนกว่าจะเปิดใช้งานจริง</span>
        </div>
      ) : null}
      {!withinWorkHours ? (
        <div className="time-lock-banner">
          <strong>นอกเวลาทำงาน</strong>
          <span>สามารถทำ checklist ได้เฉพาะเวลา 09:00-23:00 เท่านั้น</span>
        </div>
      ) : null}
      <div className="runner-status">
        <div>
          <span>ความคืบหน้าทั้งวัน</span>
          <strong>{progress}%</strong>
        </div>
        <div className="board-stat compact">
          <span>Done</span>
          <strong>{completed}/{total}</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-workflow">
        {checklistPhases.map((phase) => {
          const done = completedCountForPhase(phase, checked);
          const record = records.find((item) => item.workDate === workDate && item.phaseId === phase.id);
          const isSubmitted = record?.status === "submitted";
          const unlocked = isPhaseUnlocked(phase.id, workDate, records);
          const isExpired = !isSubmitted && isPhasePastDue(phase.id, workDate, now);
          const adminUnlocked = Boolean(record?.adminUnlockedAt);
          const flexible = isFlexibleWorkflowPhase(phase.id);
          const canEdit = withinWorkHours && canEditWorkflowRecord(record, { adminOverride: isAdmin }) && unlocked && (isAdmin || flexible || !isExpired);
          const missingStockReorderList = stockReorderListMissing(phase);
          const missingStockTakeStatus = missingStockTakeApproval(phase);
          const canSubmit = canEdit && done === phase.checklist.length && !missingStockReorderList && !missingStockTakeStatus;
          const canAdminUnlock = isAdmin && unlocked && canAdminUnlockWorkflowRecord(record, phase.id, workDate, now) && !adminUnlocked && !trialMode;
          const schedule = phaseScheduleForWorkDate(phase.id, workDate);
          return (
            <section key={phase.id} id={phase.id} className={`training-card phase-${phase.category}`}>
              <div className="workflow-card-head">
                <span className="phase-icon">{phase.icon}</span>
                <div>
                  <p className="eyebrow">{phase.timeLabel}</p>
                  <h3>{phase.title}</h3>
                </div>
                <div className="workflow-card-meta">
                  <a className="phase-detail-link" href={workflowManualHref(phase.id)}>รายละเอียด</a>
                  <em>{done}/{phase.checklist.length}</em>
                </div>
              </div>
              <p className="phase-window">
                เวลาที่กำหนด {schedule.startLabel}-{schedule.endLabel}
                {!unlocked ? " · ต้องทำขั้นก่อนหน้าให้เสร็จก่อน" : ""}
                {isExpired && !flexible && !isAdmin && !adminUnlocked ? " · เลยเวลาแล้ว ไม่สามารถกลับไปทำได้" : ""}
                {isExpired && !flexible && isAdmin ? " · admin แก้ไขได้" : ""}
                {adminUnlocked ? " · admin ปลดล็อคให้แก้ไข" : ""}
                {!withinWorkHours ? " · นอกเวลาทำงาน 09:00-23:00" : ""}
              </p>
              <div className="checklist-tick-list">
                {phase.checklist.map((item, index) => {
                  const key = itemKey(phase.id, index);
                  const noOrderKey = noOrderKeyForPhase(phase);
                  const disabledByNoOrder = Boolean(noOrderKey && checked[noOrderKey] && key !== noOrderKey);
                  const hasDetail =
                    phase.id === "open-store" ||
                    phase.id === "stock-work" ||
                    (phase.id === "close-store" && index === 4);
                  return (
                    <div key={key} className={hasDetail ? "tick-group has-detail" : "tick-group"}>
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
                          {phase.id === "close-store" ? (
                            <CloseStoreTaskDetails
                              index={index}
                              canEdit={canEdit}
                              workDate={workDate}
                              details={details}
                              updateDetail={updateDetail}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {missingStockReorderList ? (
                <p className="phase-warning">กรอกรายการและจำนวนที่ต้องสั่งเพิ่มก่อนส่งงาน</p>
              ) : null}
              {missingStockTakeStatus ? (
                <p className="phase-warning">StoreHub Stock Take ต้องเป็น Completed ก่อนส่งงาน Stock</p>
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
                <button type="button" className="green-button" onClick={() => recordPhase(phase, "submitted")} disabled={!canSubmit}>
                  ส่งงาน
                </button>
                {record ? (
                  <strong className={isSubmitted ? "record-status submitted" : "record-status"}>
                    {isSubmitted ? "ส่งตรวจแล้ว" : record.status === "missed" ? "หมดเวลาแล้ว" : "บันทึกแล้ว"} · {record.completed}/{record.total}
                  </strong>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
