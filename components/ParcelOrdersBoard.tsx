"use client";

// "พัสดุการ์ด" — การ์ดที่เจ้าของร้านสั่งจากพ่อค้า ส่งมาที่ร้าน.
// แอดมินหน้าร้าน: ของมา → อัปวิดีโอแกะกล่อง → เทียบทีละรายการ (ตรง / ไม่ตรง / ไม่มี) →
// ลงตามที่บอก (เก็บไว้ก่อน หรือ ลงแฟ้มขาย ราคา X) → กด "ลงแล้ว".
// เดดไลน์และ KPI อยู่ที่ lib/parcel-orders.ts.
//
// ของมาก่อนออเดอร์ (เจ้าของร้านลืมลง): แอดมินกด "ของมาแต่ไม่มีในรายการ" ลงรูปไว้ก่อน →
// เจ้าของร้านจับคู่เข้าออเดอร์ที่ลงไว้ หรือกด "ใส่รายการการ์ด" ลงในกล่องนั้นตรงๆ.
//
// compact = โหมดหน้าหลักพนักงาน: โชว์เฉพาะกล่องที่ถึงแล้วรอทำ + บรรทัดสรุปกล่องที่กำลังมา.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clapperboard, Plus, ExternalLink, Link2, PackageCheck, PackageOpen, PackagePlus, PencilLine, Undo2, X } from "lucide-react";
import {
  itemDestination,
  matchCandidates,
  parcelCounts,
  parcelState,
  parcelStatusText,
  PARCEL_STATE_LABEL,
  type ParcelCheck,
  type ParcelOrder,
  type ParcelState
} from "../lib/parcel-orders.ts";
import {
  cancelParcel,
  checkParcelItem,
  draftFromOrder,
  fetchParcelFeed,
  markArrivedByOwner,
  matchParcel,
  reportParcelProblem,
  resolveParcelProblem,
  storeParcelItem,
  uploadUnboxVideo
} from "../lib/parcel-orders-store.ts";
import { branchShortName } from "../lib/store-config.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

/** คนที่ไม่มีรหัสพนักงาน (เจ้าของร้าน) ถูกบันทึกเป็นอีเมล — ไม่โชว์อีเมลยาวบนจอ */
function who(by?: string): string {
  if (!by) return "";
  return by.includes("@") ? "เจ้าของร้าน" : displayNameFor(by);
}
import { ParcelOrderForm } from "./ParcelOrderForm.tsx";
import { ParcelReceiveForm } from "./ParcelReceiveForm.tsx";

const REFRESH_MS = 60_000;

type Filter = "open" | "done" | "all";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "open", label: "ยังไม่จบ" },
  { value: "done", label: "เรียบร้อยแล้ว" },
  { value: "all", label: "ทั้งหมด" }
];

const STAFF_STATES: ParcelState[] = ["arrived", "late"];

export function ParcelOrdersBoard({
  branch,
  canAct = true,
  isAdmin = false,
  compact = false
}: {
  /** ไม่ส่ง = ทุกสาขา (หน้าเจ้าของร้าน) */
  branch?: string;
  canAct?: boolean;
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const [orders, setOrders] = useState<ParcelOrder[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [showForm, setShowForm] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [editingId, setEditingId] = useState("");

  const reload = useCallback(async () => {
    try {
      const feed = await fetchParcelFeed(branch);
      setOrders(feed.orders);
      setToday(feed.today);
      setError("");
    } catch {
      setError("โหลดพัสดุไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  const counts = parcelCounts(orders, today);
  const staffQueue = orders.filter((order) => STAFF_STATES.includes(parcelState(order, today)));
  const shown = compact
    ? staffQueue
    : orders.filter((order) => {
        const state = parcelState(order, today);
        const finished = state === "done" || state === "cancelled";
        return filter === "all" || (filter === "done" ? finished : !finished);
      });

  // หน้าหลักพนักงาน: ไม่มีอะไรต้องทำและไม่มีกล่องกำลังมา = ไม่ต้องกินที่บนจอ
  if (compact && !loading && !staffQueue.length && !counts.waiting && !counts.overdue && !error) return null;

  const headline = loading
    ? "กำลังโหลด…"
    : counts.late
      ? `เลยกำหนด ${counts.late} กล่อง`
      : !compact && counts.unmatched
        ? `รอจับคู่ ${counts.unmatched} กล่อง`
      : staffQueue.length
        ? `รอแกะ/ลง ${staffQueue.length} กล่อง`
        : compact
          ? `กำลังมา ${counts.waiting + counts.overdue} กล่อง`
          : counts.overdue
            ? `เกิน 5 วัน ${counts.overdue} กล่อง`
            : "ไม่มีกล่องค้าง";

  return (
    <article id="parcel-orders" className="task-section parcel-board">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">การ์ดที่สั่งเข้าร้าน</p>
          <h3>พัสดุการ์ด</h3>
        </div>
        <span className={`status-pill ${counts.late || (!compact && (counts.overdue || counts.unmatched)) ? "is-late" : ""}`}>{headline}</span>
      </div>

      {compact ? (
        <p className="parcel-board__hint">
          ของมาถึงร้าน → ถ่ายวิดีโอตอนแกะ → เช็คกับรายการ → ลงตามที่บอก ให้จบภายในวันที่ของถึงหรือวันถัดไป
          (เลยกำหนดหักคะแนนงานที่มอบหมาย) · <Link href="/parcels/guide">วิธีใช้</Link>
          {counts.waiting + counts.overdue > 0 ? (
            <>
              {" "}· กำลังมา {counts.waiting + counts.overdue} กล่อง — <Link href="/parcels">ดูทั้งหมด / รับพัสดุ</Link>
            </>
          ) : null}
          {" "}· ของมาแต่ไม่มีในรายการ? <Link href="/parcels">ลงพัสดุไว้ก่อน</Link>
        </p>
      ) : (
        <>
        <p className="parcel-board__hint">
          ของต้องถึงร้านภายใน 5 วันหลังสั่ง · ถึงแล้วถ่ายวิดีโอตอนแกะ เช็คกับรายการ แล้วลงตามที่บอก ให้จบภายในวันที่ของถึงหรือวันถัดไป
          · ของมาแต่ไม่มีในรายการ ลงไว้ก่อนได้ เจ้าของร้านจับคู่ทีหลัง
        </p>
        <div className="parcel-board__toolbar">
          <div className="delivery-board__filters" role="tablist" aria-label="ตัวกรองพัสดุ">
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
          <Link href="/parcels/guide" className="parcel-board__guide">วิธีใช้ (คู่มือ)</Link>
          {canAct && !showReceive ? (
            <button type="button" className="parcel-board__receive" onClick={() => setShowReceive(true)}>
              <PackagePlus size={16} aria-hidden />
              ของมาแต่ไม่มีในรายการ
            </button>
          ) : null}
          {isAdmin && canAct && !showForm ? (
            <button type="button" className="parcel-board__new" onClick={() => setShowForm(true)}>
              <Plus size={16} aria-hidden />
              ลงออเดอร์ใหม่
            </button>
          ) : null}
        </div>
        </>
      )}

      {showReceive && !compact ? (
        <ParcelReceiveForm
          branch={branch}
          onSaved={() => {
            setShowReceive(false);
            void reload();
          }}
          onCancel={() => setShowReceive(false)}
        />
      ) : null}

      {showForm && !compact ? (
        <ParcelOrderForm
          onSaved={() => {
            setShowForm(false);
            void reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {error ? <p className="parcel-board__error" role="alert">{error}</p> : null}

      {!loading && !shown.length && !compact ? (
        <p className="delivery-board__empty">
          {filter === "done" ? "ยังไม่มีกล่องที่เรียบร้อยในช่วงนี้" : "ไม่มีพัสดุค้าง — ลงออเดอร์ใหม่เมื่อสั่งการ์ดจากพ่อค้า"}
        </p>
      ) : null}

      <ul className="parcel-board__list">
        {shown.map((order) =>
          editingId === order.id ? (
            <li key={order.id} className="parcel-order">
              {order.unmatched ? (
                <p className="parcel-board__hint">
                  ใส่ร้าน/รายการการ์ดของกล่องนี้ — บันทึกแล้วถือว่าจับคู่ น้องเช็คของต่อได้เลย
                </p>
              ) : null}
              <ParcelOrderForm
                orderId={order.id}
                initial={draftFromOrder(order)}
                onSaved={() => {
                  setEditingId("");
                  void reload();
                }}
                onCancel={() => setEditingId("")}
              />
            </li>
          ) : (
            <ParcelOrderCard
              key={order.id}
              order={order}
              today={today}
              canAct={canAct}
              isAdmin={isAdmin}
              busy={busy}
              run={run}
              showBranch={!branch}
              candidates={matchCandidates(orders)}
              onEdit={() => setEditingId(order.id)}
            />
          )
        )}
      </ul>
    </article>
  );
}

function ParcelOrderCard({
  order,
  today,
  canAct,
  isAdmin,
  busy,
  run,
  showBranch,
  candidates,
  onEdit
}: {
  order: ParcelOrder;
  today: string;
  canAct: boolean;
  isAdmin: boolean;
  busy: string;
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  showBranch: boolean;
  candidates: ParcelOrder[];
  onEdit: () => void;
}) {
  const state = parcelState(order, today);
  const [progress, setProgress] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<{ itemId: string; check: ParcelCheck } | null>(null);
  const [note, setNote] = useState("");
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemNote, setProblemNote] = useState("");
  const [resolution, setResolution] = useState<Record<number, string>>({});
  const [arrivedDate, setArrivedDate] = useState(today);
  const [ownerArriveOpen, setOwnerArriveOpen] = useState(false);
  const [matchTo, setMatchTo] = useState("");
  const unmatched = state === "unmatched";
  const fileRef = useRef<HTMLInputElement>(null);
  const arrived = Boolean(order.arrivedDate);
  const working = busy.startsWith(order.id);
  const problems = order.problems || [];
  const handledCount = order.items.filter((item) => item.check && (item.check !== "ok" || item.storedAt)).length;

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setProgress(0);
    await run(`${order.id}:video`, () => uploadUnboxVideo(order.id, file, setProgress));
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <li className={`parcel-order parcel-order--${state}`}>
      <div className="parcel-order__head">
        <div className="parcel-order__title">
          <p className="parcel-order__meta">
            {showBranch ? `${branchShortName(order.branch)} · ` : ""}
            {unmatched ? `ถึง ${order.arrivedDate}${order.arrivedBy ? ` · ${who(order.arrivedBy)}รับ` : ""}` : `สั่ง ${order.orderedDate}`}
            {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
            {order.totalPaid ? ` · จ่าย ${order.totalPaid.toLocaleString("th-TH")} บาท` : ""}
          </p>
          <strong>
            {unmatched ? `ยังไม่มีออเดอร์ · ${order.seller}` : order.seller}
            {order.sellerLink ? (
              <a href={order.sellerLink} target="_blank" rel="noreferrer" aria-label="เปิดแชทพ่อค้า" className="parcel-order__link">
                <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
          </strong>
          <em className="parcel-order__status">{parcelStatusText(order, today)}</em>
        </div>
        <span className={`parcel-order__pill parcel-order__pill--${state}`}>{PARCEL_STATE_LABEL[state]}</span>
      </div>

      {order.note ? <p className="parcel-order__note">{order.note}</p> : null}

      {order.sellerPhotos.length ? (
        <div className="parcel-order__photos">
          {order.sellerPhotos.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`รูปจากพ่อค้า ${index + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}

      {order.arrivalPhotos?.length ? (
        <div className="parcel-order__photos">
          {order.arrivalPhotos.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`รูปตอนรับของ ${index + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}

      {/* เจ้าของร้านจับคู่พัสดุที่น้องลงไว้ก่อน */}
      {unmatched && isAdmin && canAct ? (
        <div className="parcel-order__match">
          <select value={matchTo} onChange={(e) => setMatchTo(e.target.value)} aria-label="เลือกออเดอร์ที่จะจับคู่">
            <option value="">{candidates.length ? "เลือกออเดอร์ที่ลงไว้…" : "ยังไม่มีออเดอร์ที่รอของ"}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.seller} · สั่ง {candidate.orderedDate} · {candidate.items.length} รายการ
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!matchTo || working}
            onClick={() => run(`${order.id}:match`, () => matchParcel(order.id, matchTo))}
          >
            <Link2 size={15} aria-hidden /> จับคู่
          </button>
          <button type="button" className="parcel-order__text-btn" onClick={onEdit}>
            <PencilLine size={14} aria-hidden /> ยังไม่ได้ลงออเดอร์ — ใส่รายการการ์ดเลย
          </button>
        </div>
      ) : null}
      {unmatched && !isAdmin ? <p className="parcel-order__meta">ลงไว้แล้ว รอเจ้าของร้านบอกว่าเป็นออเดอร์ไหน แล้วค่อยเช็คของ</p> : null}

      {/* ขั้น 1: รับพัสดุ = อัปวิดีโอแกะกล่อง */}
      {(!arrived || (unmatched && !order.unboxVideoUrl)) && canAct && state !== "cancelled" ? (
        <div className="parcel-order__arrive">
          <label className={`parcel-order__video-btn ${working ? "is-busy" : ""}`}>
            <PackageOpen size={18} aria-hidden />
            <span>{progress !== null ? `กำลังอัปวิดีโอ ${Math.round(progress * 100)}%` : "ของมาแล้ว — อัปวิดีโอแกะกล่อง"}</span>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              capture="environment"
              disabled={working}
              onChange={(event) => void onVideo(event.target.files?.[0])}
            />
          </label>
          {progress !== null ? (
            <div className="parcel-order__progress" aria-hidden>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
          {isAdmin && !arrived && !ownerArriveOpen ? (
            <button type="button" className="parcel-order__text-btn" onClick={() => setOwnerArriveOpen(true)}>
              เจ้าของร้าน: บันทึกว่าถึงร้านแล้ว (ไม่มีวิดีโอ)
            </button>
          ) : null}
          {isAdmin && ownerArriveOpen ? (
            <div className="parcel-order__owner-arrive">
              <input type="date" value={arrivedDate} max={today} onChange={(e) => setArrivedDate(e.target.value)} aria-label="วันที่ถึงร้าน" />
              <button
                type="button"
                disabled={working}
                onClick={() => run(`${order.id}:arrive`, () => markArrivedByOwner(order.id, arrivedDate))}
              >
                บันทึกวันที่ถึง
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {order.unboxVideoUrl ? (
        <a className="parcel-order__video" href={order.unboxVideoUrl} target="_blank" rel="noreferrer">
          <Clapperboard size={16} aria-hidden /> วิดีโอแกะกล่อง
          {order.arrivedBy ? ` · ${who(order.arrivedBy)}` : ""} · ถึง {order.arrivedDate}
        </a>
      ) : arrived && !unmatched ? (
        <p className="parcel-order__meta">ถึงร้าน {order.arrivedDate} (เจ้าของร้านบันทึก)</p>
      ) : null}

      {/* ขั้น 2–3: เช็คทีละรายการ แล้วลงตามที่บอก */}
      <ul className="parcel-items">
        {order.items.map((item) => {
          const key = `${order.id}:${item.id}`;
          const itemBusy = busy === key;
          return (
            <li key={item.id} className={`parcel-item ${item.storedAt ? "is-stored" : ""} ${item.check && item.check !== "ok" ? "is-bad" : ""}`}>
              <div className="parcel-item__main">
                <strong>
                  {item.name}
                  {item.qty > 1 ? ` ×${item.qty}` : ""}
                </strong>
                <span className={`parcel-item__dest parcel-item__dest--${item.plan}`}>{itemDestination(item)}</span>
                {item.note ? <small>{item.note}</small> : null}
                {item.check && item.check !== "ok" ? (
                  <small className="parcel-item__bad">
                    {item.check === "missing" ? "ไม่มีในกล่อง" : "ไม่ตรง"}: {item.checkNote}
                  </small>
                ) : null}
                {item.storedAt ? (
                  <small className="parcel-item__ok">
                    ลงแล้ว{item.storedBy ? ` · ${who(item.storedBy)}` : ""}
                  </small>
                ) : null}
              </div>

              {arrived && canAct && state !== "cancelled" ? (
                <div className="parcel-item__actions">
                  {!item.check ? (
                    <>
                      <button type="button" className="is-ok" disabled={itemBusy} onClick={() => run(key, () => checkParcelItem(order.id, item.id, "ok"))}>
                        <Check size={15} aria-hidden /> ตรง
                      </button>
                      <button type="button" className="is-bad" disabled={itemBusy} onClick={() => { setNoteFor({ itemId: item.id, check: "wrong" }); setNote(""); }}>
                        ไม่ตรง
                      </button>
                      <button type="button" className="is-bad" disabled={itemBusy} onClick={() => { setNoteFor({ itemId: item.id, check: "missing" }); setNote(""); }}>
                        ไม่มี
                      </button>
                    </>
                  ) : null}
                  {item.check === "ok" && !item.storedAt ? (
                    <button type="button" className="is-store" disabled={itemBusy} onClick={() => run(key, () => storeParcelItem(order.id, item.id, true))}>
                      <PackageCheck size={15} aria-hidden /> ลงแล้ว
                    </button>
                  ) : null}
                  {item.check ? (
                    <button
                      type="button"
                      className="is-undo"
                      disabled={itemBusy}
                      aria-label="ย้อนกลับรายการนี้"
                      onClick={() =>
                        run(key, () => (item.storedAt ? storeParcelItem(order.id, item.id, false) : checkParcelItem(order.id, item.id, null)))
                      }
                    >
                      <Undo2 size={15} aria-hidden /> ย้อน
                    </button>
                  ) : null}
                </div>
              ) : null}

              {noteFor?.itemId === item.id ? (
                <div className="parcel-item__note-form">
                  <input
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={noteFor.check === "missing" ? "เช่น ในกล่องไม่มีใบนี้" : "เช่น ได้คนละใบ / มุมช้ำ"}
                    aria-label="รายละเอียดที่ไม่ตรง"
                  />
                  <button
                    type="button"
                    disabled={!note.trim() || itemBusy}
                    onClick={async () => {
                      await run(key, () => checkParcelItem(order.id, item.id, noteFor.check, note));
                      setNoteFor(null);
                    }}
                  >
                    แจ้งเจ้าของร้าน
                  </button>
                  <button type="button" className="is-undo" aria-label="ปิด" onClick={() => setNoteFor(null)}>
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {arrived && !unmatched ? (
        <p className="parcel-order__meta">
          ทำแล้ว {handledCount}/{order.items.length} รายการ
        </p>
      ) : null}

      {/* ปัญหา: แอดมินแจ้ง → เจ้าของร้านตามพ่อค้าแล้วปิดเรื่อง */}
      {problems.length ? (
        <ul className="parcel-problems">
          {problems.map((problem, index) => (
            <li key={`${problem.at}-${index}`} className={problem.resolvedAt ? "is-resolved" : ""}>
              <p>
                {problem.note}
                <small> · {who(problem.by)}</small>
              </p>
              {problem.resolvedAt ? (
                <small>ปิดแล้ว: {problem.resolution}</small>
              ) : isAdmin && canAct ? (
                <div className="parcel-item__note-form">
                  <input
                    value={resolution[index] ?? ""}
                    onChange={(e) => setResolution((prev) => ({ ...prev, [index]: e.target.value }))}
                    placeholder="จัดการยังไง เช่น พ่อค้าคืนเงินแล้ว"
                    aria-label="วิธีจัดการ"
                  />
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => run(`${order.id}:resolve`, () => resolveParcelProblem(order.id, index, resolution[index] ?? ""))}
                  >
                    ปิดเรื่อง
                  </button>
                </div>
              ) : (
                <small>รอเจ้าของร้านตามพ่อค้า</small>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {canAct && state !== "cancelled" ? (
        <div className="parcel-order__footer">
          {arrived ? (
            problemOpen ? (
              <div className="parcel-item__note-form">
                <input
                  autoFocus
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="เช่น กล่องบุบ / ของเกินมา"
                  aria-label="ปัญหาอื่น"
                />
                <button
                  type="button"
                  disabled={!problemNote.trim() || working}
                  onClick={async () => {
                    await run(`${order.id}:problem`, () => reportParcelProblem(order.id, problemNote));
                    setProblemOpen(false);
                    setProblemNote("");
                  }}
                >
                  แจ้งเจ้าของร้าน
                </button>
                <button type="button" className="is-undo" aria-label="ปิด" onClick={() => setProblemOpen(false)}>
                  <X size={15} aria-hidden />
                </button>
              </div>
            ) : (
              <button type="button" className="parcel-order__text-btn" onClick={() => setProblemOpen(true)}>
                แจ้งปัญหาอื่น
              </button>
            )
          ) : null}
          {isAdmin ? (
            <>
              {!unmatched ? (
                <button type="button" className="parcel-order__text-btn" onClick={onEdit}>
                  <PencilLine size={14} aria-hidden /> แก้ออเดอร์
                </button>
              ) : null}
              <button
                type="button"
                className="parcel-order__text-btn is-danger"
                disabled={working}
                onClick={() => run(`${order.id}:cancel`, () => cancelParcel(order.id, true))}
              >
                {unmatched ? "ไม่ใช่ของร้าน — ลบออก" : "ยกเลิกออเดอร์"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {isAdmin && canAct && state === "cancelled" ? (
        <button type="button" className="parcel-order__text-btn" onClick={() => run(`${order.id}:cancel`, () => cancelParcel(order.id, false))}>
          <Undo2 size={14} aria-hidden /> เลิกยกเลิก
        </button>
      ) : null}
    </li>
  );
}
