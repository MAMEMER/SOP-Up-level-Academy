"use client";

// "งานส่งของ" บน Dashboard — ออเดอร์ที่ลูกค้าจ่ายเงินแล้วบนเว็บกิลด์จะเด้งมาที่กะที่
// รับผิดชอบเอง ทีมหน้าร้านไม่ต้องเปิดหน้า admin ของเว็บกิลด์มานั่งไล่เอง.
//
// กติกา (lib/delivery-tasks.ts): สองกะอยู่ร้านคาบกันเกือบทั้งวัน ออเดอร์จึงขึ้นทั้งสองกะ
// ของวันนั้น · จ่ายตั้งแต่ 15:00 ขึ้นให้ทีมพรุ่งนี้ด้วย · วันนี้ส่งไม่ทันก็กด "ส่งงานให้
// พรุ่งนี้" เพื่อให้ยังส่งได้ภายใน 1 วัน.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deliveryStatusText,
  deliveryTargetLabel,
  deliveryTaskState,
  isOwnShiftTask,
  type DeliveryTask
} from "../lib/delivery-tasks.ts";
import type { ShiftCode } from "../lib/shift-schedule.ts";
import { claimDelivery, fetchDeliveryFeed, handoffDelivery, shipDelivery } from "../lib/delivery-tasks-store.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

const REFRESH_MS = 60_000;

// หน้าแรกโชว์เฉพาะใบที่ยังต้องทำ — ใบที่ปิดแล้วยังเปิดดูย้อนหลังได้จากตัวกรองนี้
type DeliveryFilter = "open" | "closed" | "all";
const FILTERS: Array<{ value: DeliveryFilter; label: string }> = [
  { value: "open", label: "กำลังดำเนินการ" },
  { value: "closed", label: "ปิดแล้ว" },
  { value: "all", label: "ทั้งหมด" }
];

export function DeliveryOrdersBoard({
  branch,
  canAct = true,
  initialTasks = [],
  initialToday = "",
  initialShift = null
}: {
  branch: string;
  canAct?: boolean;
  /** งานที่ server render ไว้แล้ว — กัน sync ซ้ำรอบสองตอนหน้าโหลด */
  initialTasks?: DeliveryTask[];
  initialToday?: string;
  initialShift?: ShiftCode | null;
}) {
  const [tasks, setTasks] = useState<DeliveryTask[]>(initialTasks);
  const [today, setToday] = useState(initialToday);
  const [shiftToday, setShiftToday] = useState<ShiftCode | null>(initialShift);
  const [loading, setLoading] = useState(!initialToday);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<DeliveryFilter>("open");

  const reload = useCallback(async () => {
    try {
      const feed = await fetchDeliveryFeed(branch, filter !== "open");
      setTasks(feed.tasks);
      setToday(feed.today);
      setShiftToday(feed.shiftToday);
      setError("");
    } catch {
      setError("โหลดออเดอร์ไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [branch, filter]);

  // งานชุดแรกมาจาก server render แล้ว — รอบแรกจึงข้ามไป ไม่ต้อง sync ซ้ำทันทีที่โหลดหน้า
  // (แต่พอเปลี่ยนตัวกรอง reload เปลี่ยน identity → ยิงใหม่ทันทีเพื่อดึงใบที่ปิดแล้วมา)
  const hasServerData = useRef(Boolean(initialToday));
  useEffect(() => {
    if (hasServerData.current) hasServerData.current = false;
    else void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError("");
    try {
      await action();
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  // งานของกะตัวเองขึ้นก่อน ที่เหลือเป็นงานของกะอื่นที่ยังค้าง — เห็นไว้เพื่อหยิบแทนกันได้
  const viewer = { isAdmin: false, staffCode: "self", shiftToday, today };
  const ordered = [...tasks].sort(
    (left, right) => Number(isOwnShiftTask(right, viewer)) - Number(isOwnShiftTask(left, viewer))
  );
  const remaining = tasks.filter((task) => task.status !== "shipped");
  const overdue = remaining.filter((task) => deliveryTaskState(task, today) === "overdue");
  const shown = ordered.filter((task) => {
    if (filter === "open") return task.status !== "shipped";
    if (filter === "closed") return task.status === "shipped";
    return true;
  });
  const headline = loading
    ? "กำลังโหลด…"
    : remaining.length === 0
      ? "ไม่มีออเดอร์ค้างส่ง"
      : `เหลือ ${remaining.length} ใบ${overdue.length ? ` · เลยกำหนด ${overdue.length}` : ""}`;

  return (
    <article id="delivery-orders" className="task-section delivery-board">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">ออเดอร์เว็บกิลด์</p>
          <h3>งานส่งของ</h3>
        </div>
        <span className={`status-pill ${overdue.length > 0 ? "is-late" : ""}`}>{headline}</span>
      </div>

      <div className="delivery-board__filters" role="tablist" aria-label="ตัวกรองออเดอร์">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            className={filter === option.value ? "delivery-board__filter is-on" : "delivery-board__filter"}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? <p className="delivery-board__error">{error}</p> : null}

      {shown.length === 0 && !loading ? (
        <p className="delivery-board__empty">
          {filter === "closed"
            ? "ยังไม่มีออเดอร์ที่ปิดแล้วในช่วงนี้"
            : "ออเดอร์ที่ลูกค้าจ่ายเงินแล้วจะขึ้นที่นี่เอง — จ่ายก่อน 15:00 เป็นงานของทีมวันนี้ หลัง 15:00 ขึ้นให้ทีมพรุ่งนี้ด้วย"}
        </p>
      ) : null}

      <ul className="delivery-board__list">
        {shown.map((task) => {
          const state = deliveryTaskState(task, today);
          const busy = busyId === task.id;
          const mine = isOwnShiftTask(task, viewer);
          return (
            <li key={task.id} className={`delivery-item delivery-item--${state}`}>
              <div className="delivery-item__main">
                <p className="delivery-item__meta">
                  #{task.orderCode} · {deliveryTargetLabel(task)}
                  {task.handedOffBy ? ` · ส่งต่อโดย ${displayNameFor(task.handedOffBy)}` : ""}
                  {shiftToday && !mine ? <span className="delivery-item__other">ของกะอื่น</span> : null}
                </p>
                <strong>{task.customerName || "ไม่ระบุชื่อผู้รับ"}</strong>
                <p className="delivery-item__items">
                  {task.itemsSummary || "ไม่มีรายละเอียดสินค้า"}
                  {task.itemCount ? ` · ${task.itemCount} ชิ้น` : ""}
                  {task.total ? ` · ${task.total.toLocaleString("th-TH")} บาท` : ""}
                </p>
                {task.customerAddress ? <p className="delivery-item__address">{task.customerAddress}</p> : null}
                {task.customerNote ? <p className="delivery-item__note">หมายเหตุลูกค้า: {task.customerNote}</p> : null}
                {task.customerPhone ? (
                  <p className="delivery-item__phone">
                    <a href={`tel:${task.customerPhone}`}>{task.customerPhone}</a>
                  </p>
                ) : null}
                <em className="delivery-item__status">
                  {deliveryStatusText(task, today)}
                  {task.claimedBy ? ` · ${displayNameFor(task.claimedBy)}` : ""}
                </em>
              </div>

              {canAct && task.status !== "shipped" ? (
                <div className="delivery-item__actions">
                  {task.status === "open" ? (
                    <button type="button" disabled={busy} onClick={() => run(task.id, () => claimDelivery(task.id))}>
                      รับงานแพ็ค
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="delivery-item__handoff"
                    disabled={busy}
                    onClick={() => run(task.id, () => handoffDelivery(task.id, branch))}
                  >
                    ส่งงานให้พรุ่งนี้
                  </button>
                  {/* ช่อง tracking โผล่หลังรับงานแล้วเท่านั้น — ลำดับตาม SOP จัดส่ง: แพ็ค → ส่ง → แจ้งเลข */}
                  {task.status === "packing" ? (
                    <>
                      <label className="delivery-item__ship">
                        <span>เลข tracking</span>
                        <input
                          value={tracking[task.id] ?? ""}
                          onChange={(event) => setTracking((prev) => ({ ...prev, [task.id]: event.target.value }))}
                          placeholder="เช่น TH01234567890"
                          inputMode="text"
                        />
                      </label>
                      <button
                        type="button"
                        className="delivery-item__done"
                        disabled={busy || !(tracking[task.id] ?? "").trim()}
                        onClick={() => run(task.id, () => shipDelivery(task.id, tracking[task.id] ?? ""))}
                      >
                        ส่งแล้ว
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
