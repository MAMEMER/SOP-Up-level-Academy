"use client";

// "ของเติมสต็อกที่สั่งแล้ว" (น้ำ ขนม accessory) — คนละระบบกับพัสดุการ์ด.
//   ลงออเดอร์: อัปรูปรายการที่สั่ง → ระบบอ่านรูป → ตรวจ → บันทึก (กันสั่งซ้ำ)
//   รับของ:   เลือกออเดอร์ → ติ๊กทีละรายการ ตรง / ไม่ตรง (ขาด เกิน ผิด เสียหาย ไม่มา + โน้ต) → รับของเสร็จ
//   ตามซัพ:   ติดต่อแล้วหรือยัง → ได้เรื่องว่าอย่างไร → งานถัดไป (ส่งตามมา = เปิดออเดอร์ค้างส่งให้รอรับ)
//
// mode: full = หน้า /supplies · receive = ในเช็คลิสต์ Stock ข้อรับของ · compact = แถบเตือนบนหน้าหลัก

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardList, PackageCheck, PackageOpen, PencilLine, Phone, Plus, Undo2, X } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { SupplyOrderForm } from "./SupplyOrderForm.tsx";
import {
  SUPPLY_CHECK_LABEL,
  SUPPLY_NEXT_STEP_LABEL,
  SUPPLY_PROBLEM_CHECKS,
  SUPPLY_STATE_LABEL,
  allItemsChecked,
  itemProblemText,
  supplyCounts,
  supplyState,
  supplyStatusText,
  type SupplyCheck,
  type SupplyNextStep,
  type SupplyOrder,
  type SupplyState
} from "../lib/supply-orders.ts";
import {
  cancelSupplyOrder,
  checkSupplyItem,
  fetchSupplyFeed,
  finishReceiving,
  reopenReceiving,
  updateFollowUp,
  type SupplyDraft
} from "../lib/supply-orders-store.ts";
import { branchShortName } from "../lib/store-config.ts";
import { displayNameFor } from "../lib/employee-directory.ts";

const REFRESH_MS = 60_000;

function who(by?: string): string {
  if (!by) return "";
  return by.includes("@") ? "เจ้าของร้าน" : displayNameFor(by);
}

function thaiDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

function draftFromOrder(order: SupplyOrder): SupplyDraft {
  return {
    branch: order.branch,
    supplier: order.supplier,
    orderedDate: order.orderedDate,
    total: order.total ? String(order.total) : "",
    note: order.note || "",
    photos: order.photos,
    items: order.items.map((item) => ({ id: item.id, name: item.name, qty: item.qty, unit: item.unit || "", productId: item.productId })),
    aiRead: Boolean(order.aiRead)
  };
}

type Filter = "open" | "done" | "all";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "open", label: "ยังไม่จบ" },
  { value: "done", label: "เรียบร้อยแล้ว" },
  { value: "all", label: "ทั้งหมด" }
];

const RECEIVE_STATES: SupplyState[] = ["receiving", "waiting", "contact", "followup"];

export function SupplyOrdersBoard({
  branch,
  mode = "full",
  canAct = true
}: {
  /** ไม่ส่ง = ทุกสาขา */
  branch?: string;
  mode?: "full" | "receive" | "compact";
  canAct?: boolean;
}) {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [today, setToday] = useState("");
  const [me, setMe] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [openId, setOpenId] = useState("");

  const reload = useCallback(async () => {
    try {
      const feed = await fetchSupplyFeed(branch);
      setOrders(feed.orders);
      setToday(feed.today);
      setMe(feed.staffCode);
      setIsAdmin(feed.isAdmin);
      setError("");
    } catch {
      setError("โหลดออเดอร์ไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function run(key: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusy(key);
    setError("");
    try {
      await action();
      await reload();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  }

  const counts = supplyCounts(orders);

  if (mode === "compact") {
    const urgent = counts.receiving + counts.contact + counts.followup;
    if (loading || !urgent) return null;
    const parts = [
      counts.receiving ? `รับของค้างเช็ค ${counts.receiving}` : "",
      counts.contact ? `ของไม่ตรง ต้องติดต่อซัพ ${counts.contact}` : "",
      counts.followup ? `รอผลจากซัพ ${counts.followup}` : ""
    ].filter(Boolean);
    return (
      <Link href="/supplies#supply-orders" className="supply-banner supply-banner--follow">
        <span className="supply-banner-title">ของเติมสต็อก — ต้องตามต่อ</span>
        <span className="supply-banner-items">{parts.join(" · ")}</span>
        <span className="supply-banner-cta">เปิดดู →</span>
      </Link>
    );
  }

  const shown =
    mode === "receive"
      ? orders.filter((order) => RECEIVE_STATES.includes(supplyState(order)))
      : orders.filter((order) => {
          const state = supplyState(order);
          const finished = state === "done" || state === "cancelled";
          return filter === "all" || (filter === "done" ? finished : !finished);
        });

  const formPanel = showForm ? (
    <SupplyOrderForm
      branch={branch}
      orderId={editingId || undefined}
      initial={editingId ? draftFromOrder(orders.find((order) => order.id === editingId)!) : undefined}
      onSaved={() => {
        setShowForm(false);
        setEditingId("");
        void reload();
      }}
      onCancel={() => {
        setShowForm(false);
        setEditingId("");
      }}
    />
  ) : null;

  return (
    <div id="supply-orders" className={`supply-board supply-board--${mode}`}>
      {mode === "full" ? (
        <>
          <div className="supply-board__head">
            <div>
              <p className="eyebrow">สั่งแล้ว</p>
              <h3>ของที่สั่งไปแล้ว</h3>
            </div>
            {canAct && !showForm ? (
              <button type="button" className="supply-board__primary" onClick={() => setShowForm(true)}>
                <Plus size={17} aria-hidden /> ลงออเดอร์ที่สั่งแล้ว
              </button>
            ) : null}
          </div>
          <p className="supply-board__hint">
            {loading
              ? "กำลังโหลด…"
              : `รอของมาส่ง ${counts.waiting + counts.receiving} ออเดอร์${counts.contact + counts.followup ? ` · ต้องตามซัพ ${counts.contact + counts.followup}` : ""}`}
            {" · "}รับของได้ที่เช็คลิสต์ Stock ข้อ &quot;รับของเติมสต็อก&quot; หรือกดที่ออเดอร์ด้านล่าง
          </p>
          {formPanel}
          <div className="delivery-board__filters supply-board__filters" role="tablist">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                className={filter === option.value ? "is-active" : ""}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="supply-board__ask">
            <PackageOpen size={18} aria-hidden /> มีของเติมสต็อกมาส่งไหม? ถ้ามี เลือกออเดอร์ แล้วเช็คทีละรายการ
          </p>
          {formPanel}
        </>
      )}

      {error ? (
        <p className="supply-board__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !shown.length ? (
        <p className="supply-board__empty">
          {mode === "receive" ? (
            <>
              ไม่มีออเดอร์ที่รอของ — วันนี้ไม่มีของมาส่ง ติ๊กข้อนี้ได้เลย. ของมาแต่หาออเดอร์ไม่เจอ (คนสั่งลืมลง)?{" "}
              {canAct ? (
                <button type="button" className="supply-board__link" onClick={() => setShowForm(true)}>
                  ลงรายการจากใบส่งของ
                </button>
              ) : null}
            </>
          ) : filter === "open" ? (
            "ไม่มีออเดอร์ค้าง"
          ) : (
            "ยังไม่มีรายการ"
          )}
        </p>
      ) : null}

      <ul className="supply-board__list">
        {shown.map((order) => (
          <SupplyOrderCard
            key={order.id}
            order={order}
            today={today}
            open={openId === order.id || (openId !== `closed:${order.id}` && ["receiving", "contact", "followup"].includes(supplyState(order)))}
            onToggle={() => {
              const autoOpen = ["receiving", "contact", "followup"].includes(supplyState(order));
              const isOpen = openId === order.id || (openId !== `closed:${order.id}` && autoOpen);
              setOpenId(isOpen ? `closed:${order.id}` : order.id);
            }}
            canAct={canAct}
            canCancel={canAct && (isAdmin || order.createdBy === me)}
            busy={busy}
            run={run}
            onEdit={() => {
              setEditingId(order.id);
              setShowForm(true);
            }}
            showBranch={!branch}
          />
        ))}
      </ul>
      {mode === "receive" ? (
        <Link href="/supplies#supply-orders" className="supply-board__link">
          ดูออเดอร์ทั้งหมด / ลงออเดอร์ที่สั่งแล้ว →
        </Link>
      ) : null}
    </div>
  );
}

function SupplyOrderCard({
  order,
  today,
  open,
  onToggle,
  canAct,
  canCancel,
  busy,
  run,
  onEdit,
  showBranch
}: {
  order: SupplyOrder;
  today: string;
  open: boolean;
  onToggle: () => void;
  canAct: boolean;
  canCancel: boolean;
  busy: string;
  run: (key: string, action: () => Promise<unknown>) => Promise<boolean>;
  onEdit: () => void;
  showBranch: boolean;
}) {
  const state = supplyState(order);
  const receiving = state === "waiting" || state === "receiving";
  const [problemFor, setProblemFor] = useState("");
  const [problemKind, setProblemKind] = useState<SupplyCheck>("short");
  const [problemQty, setProblemQty] = useState("");
  const [problemNote, setProblemNote] = useState("");
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>([]);
  const [receiveNote, setReceiveNote] = useState("");
  const checked = order.items.filter((item) => item.check).length;

  function openProblem(itemId: string) {
    setProblemFor(itemId);
    setProblemKind("short");
    setProblemQty("");
    setProblemNote("");
  }

  const needsQty = problemKind === "short" || problemKind === "over";

  return (
    <li className={`supply-ord supply-ord--${state}`}>
      <button type="button" className="supply-ord__head" onClick={onToggle} aria-expanded={open}>
        <span className="supply-ord__title">
          <strong>
            {order.supplier}
            {order.parentId ? <em className="supply-ord__tag">ค้างส่ง</em> : null}
          </strong>
          <small>
            สั่ง {thaiDate(order.orderedDate)} · {order.items.length} รายการ
            {order.total ? ` · ${order.total.toLocaleString("th-TH")} บาท` : ""}
            {showBranch ? ` · ${branchShortName(order.branch)}` : ""} · ลงโดย {who(order.createdBy)}
          </small>
          <span className="supply-ord__status">{supplyStatusText(order, today)}</span>
          {receiving && canAct && !open ? <span className="supply-ord__cta">ของมาแล้ว? แตะเพื่อรับของออเดอร์นี้</span> : null}
        </span>
        <span className={`supply-ord__pill supply-ord__pill--${state}`}>{SUPPLY_STATE_LABEL[state]}</span>
      </button>

      {open ? (
        <div className="supply-ord__body">
          {order.photos.length ? (
            <div className="supply-ord__photos">
              {order.photos.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`รูปรายการที่สั่ง ${index + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
          {order.note ? <p className="supply-ord__note">{order.note}</p> : null}

          {receiving && canAct ? (
            <p className="supply-ord__progress-text">
              <ClipboardList size={16} aria-hidden /> เทียบของที่มาส่งกับรายการทีละข้อ · เช็คแล้ว {checked}/{order.items.length}
            </p>
          ) : null}

          <ul className="supply-items">
            {order.items.map((item) => {
              const key = `${order.id}:${item.id}`;
              const itemBusy = busy === key;
              const bad = item.check && item.check !== "ok";
              return (
                <li key={item.id} className={`supply-item ${item.check === "ok" ? "is-ok" : ""} ${bad ? "is-bad" : ""}`}>
                  <div className="supply-item__main">
                    <strong>
                      {item.name} <span className="supply-item__qty">×{item.qty}{item.unit ? ` ${item.unit}` : ""}</span>
                    </strong>
                    {item.check === "ok" ? <small className="supply-item__ok">ตรง{item.checkedBy ? ` · ${who(item.checkedBy)}` : ""}</small> : null}
                    {bad ? <small className="supply-item__bad">{itemProblemText(item)}</small> : null}
                  </div>
                  {receiving && canAct ? (
                    <div className="supply-item__actions">
                      {!item.check ? (
                        <>
                          <button type="button" className="is-ok" disabled={itemBusy} onClick={() => void run(key, () => checkSupplyItem(order.id, item.id, "ok"))}>
                            <Check size={15} aria-hidden /> ตรง
                          </button>
                          <button type="button" className="is-bad" disabled={itemBusy} onClick={() => openProblem(item.id)}>
                            ไม่ตรง
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="is-undo"
                          disabled={itemBusy}
                          aria-label={`ย้อนผลเช็ค ${item.name}`}
                          onClick={() => void run(key, () => checkSupplyItem(order.id, item.id, null))}
                        >
                          <Undo2 size={15} aria-hidden /> ย้อน
                        </button>
                      )}
                    </div>
                  ) : null}

                  {problemFor === item.id ? (
                    <div className="supply-item__problem">
                      <div className="supply-chips" role="radiogroup" aria-label="ไม่ตรงยังไง">
                        {SUPPLY_PROBLEM_CHECKS.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            role="radio"
                            aria-checked={problemKind === kind}
                            className={problemKind === kind ? "is-on" : ""}
                            onClick={() => setProblemKind(kind)}
                          >
                            {SUPPLY_CHECK_LABEL[kind]}
                          </button>
                        ))}
                      </div>
                      <div className="supply-item__problem-row">
                        {needsQty ? (
                          <label className="supply-item__got">
                            <span>ได้มา</span>
                            <input inputMode="numeric" value={problemQty} onChange={(e) => setProblemQty(e.target.value.replace(/\D/g, ""))} placeholder={String(item.qty)} />
                          </label>
                        ) : null}
                        <input
                          className="supply-item__note"
                          value={problemNote}
                          onChange={(e) => setProblemNote(e.target.value)}
                          placeholder={problemKind === "wrong" ? "ได้อะไรมาแทน" : problemKind === "damaged" ? "เสียหายยังไง กี่ชิ้น" : "โน้ต (ไม่บังคับ)"}
                          aria-label="รายละเอียด"
                        />
                      </div>
                      <div className="supply-item__problem-row">
                        <button
                          type="button"
                          className="supply-board__primary supply-board__primary--sm"
                          disabled={itemBusy || (needsQty ? !problemQty : !problemNote.trim() && problemKind !== "missing")}
                          onClick={async () => {
                            const note = problemNote.trim() || (problemKind === "missing" ? "ไม่มาเลย" : "");
                            const ok = await run(key, () =>
                              checkSupplyItem(order.id, item.id, problemKind, problemQty ? Number(problemQty) : undefined, note)
                            );
                            if (ok) setProblemFor("");
                          }}
                        >
                          บันทึกว่าไม่ตรง
                        </button>
                        <button type="button" className="supply-board__secondary" aria-label="ปิด" onClick={() => setProblemFor("")}>
                          <X size={15} aria-hidden /> ปิด
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {receiving && canAct && allItemsChecked(order) ? (
            <div className="supply-ord__finish">
              <EvidencePhotosInput
                value={deliveryPhotos.join("\n")}
                onChange={(value) => setDeliveryPhotos(value.split("\n").filter(Boolean))}
                max={4}
                label="รูปของที่มาส่ง / ใบส่งของ (ไม่บังคับ)"
              />
              <textarea value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} rows={2} placeholder="โน้ตตอนรับของ (ไม่บังคับ)" aria-label="โน้ตตอนรับของ" />
              <button
                type="button"
                className="supply-board__primary"
                disabled={busy === `finish:${order.id}`}
                onClick={() => void run(`finish:${order.id}`, () => finishReceiving(order.id, deliveryPhotos, receiveNote))}
              >
                <PackageCheck size={17} aria-hidden />
                {order.items.some((item) => item.check && item.check !== "ok") ? "รับของเสร็จ — แจ้งของไม่ตรง" : "รับของเสร็จ ครบทุกรายการ"}
              </button>
            </div>
          ) : null}

          {order.receivedDate ? (
            <p className="supply-ord__meta">
              รับของ {thaiDate(order.receivedDate)}
              {order.receivedBy ? ` · ${who(order.receivedBy)}` : ""}
              {order.receiveNote ? ` · ${order.receiveNote}` : ""}
            </p>
          ) : null}
          {order.deliveryPhotos?.length ? (
            <div className="supply-ord__photos">
              {order.deliveryPhotos.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`รูปของที่มาส่ง ${index + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}

          {state === "contact" || state === "followup" || (state === "done" && order.followUp?.contactedAt) ? (
            <FollowUpChecklist order={order} canAct={canAct} busy={busy} run={run} />
          ) : null}

          {canAct ? (
            <div className="supply-ord__footer">
              {receiving && !checked ? (
                <button type="button" className="supply-ord__text-btn" onClick={onEdit}>
                  <PencilLine size={15} aria-hidden /> แก้รายการ
                </button>
              ) : null}
              {state === "contact" ? (
                <button type="button" className="supply-ord__text-btn" onClick={() => void run(`reopen:${order.id}`, () => reopenReceiving(order.id))}>
                  <Undo2 size={15} aria-hidden /> แก้ผลรับของ
                </button>
              ) : null}
              {canCancel && receiving ? (
                <button
                  type="button"
                  className="supply-ord__text-btn is-danger"
                  onClick={() => void run(`cancel:${order.id}`, () => cancelSupplyOrder(order.id, true))}
                >
                  ยกเลิกออเดอร์
                </button>
              ) : null}
              {canCancel && state === "cancelled" ? (
                <button type="button" className="supply-ord__text-btn" onClick={() => void run(`cancel:${order.id}`, () => cancelSupplyOrder(order.id, false))}>
                  เอากลับมา
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const NEXT_STEPS: SupplyNextStep[] = ["resend", "refund", "return", "accept", "other"];

function FollowUpChecklist({
  order,
  canAct,
  busy,
  run
}: {
  order: SupplyOrder;
  canAct: boolean;
  busy: string;
  run: (key: string, action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const followUp = order.followUp || {};
  const [channel, setChannel] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextStep, setNextStep] = useState<SupplyNextStep | "">("");
  const [nextNote, setNextNote] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [doneNote, setDoneNote] = useState("");
  const key = `follow:${order.id}`;
  const working = busy === key;
  const send = (input: Record<string, unknown>) => run(key, () => updateFollowUp(order.id, input));
  const needsDone = followUp.nextStep && followUp.nextStep !== "resend" && followUp.nextStep !== "accept";

  return (
    <div className="supply-follow">
      <p className="supply-follow__title">
        <Phone size={16} aria-hidden /> ตามเรื่องกับซัพ
      </p>
      <ol className="supply-follow__steps">
        <li className={followUp.contactedAt ? "is-done" : ""}>
          <span className="supply-follow__mark" aria-hidden>{followUp.contactedAt ? <Check size={14} /> : null}</span>
          <div className="supply-follow__body">
            <strong>ติดต่อซัพแล้วหรือยัง</strong>
            {followUp.contactedAt ? (
              <small>
                ติดต่อแล้ว{followUp.channel ? ` ทาง${followUp.channel}` : ""} · {who(followUp.contactedBy)}
                {canAct && !followUp.decidedAt ? (
                  <button type="button" className="supply-ord__text-btn" disabled={working} onClick={() => void send({ step: "undo-contact" })}>
                    ย้อน
                  </button>
                ) : null}
              </small>
            ) : canAct ? (
              <div className="supply-follow__form">
                <div className="supply-chips">
                  {["โทร", "LINE", "หน้าร้าน/คนส่งของ"].map((option) => (
                    <button key={option} type="button" className={channel === option ? "is-on" : ""} onClick={() => setChannel(option)}>
                      {option}
                    </button>
                  ))}
                </div>
                <button type="button" className="supply-board__primary supply-board__primary--sm" disabled={working} onClick={() => void send({ step: "contact", channel })}>
                  ติดต่อแล้ว
                </button>
              </div>
            ) : null}
          </div>
        </li>

        <li className={followUp.decidedAt ? "is-done" : ""}>
          <span className="supply-follow__mark" aria-hidden>{followUp.decidedAt ? <Check size={14} /> : null}</span>
          <div className="supply-follow__body">
            <strong>ได้เรื่องว่าอย่างไร + งานถัดไป</strong>
            {followUp.decidedAt && followUp.nextStep ? (
              <small>
                {followUp.outcome} → <b>{SUPPLY_NEXT_STEP_LABEL[followUp.nextStep]}</b>
                {followUp.nextDueDate ? ` (นัด ${thaiDate(followUp.nextDueDate)})` : ""}
                {followUp.nextNote ? ` · ${followUp.nextNote}` : ""} · {who(followUp.decidedBy)}
                {canAct && !followUp.doneAt ? (
                  <button type="button" className="supply-ord__text-btn" disabled={working} onClick={() => void send({ step: "undo-decide" })}>
                    ย้อน
                  </button>
                ) : null}
              </small>
            ) : canAct && followUp.contactedAt ? (
              <div className="supply-follow__form">
                <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} placeholder="ซัพตอบว่า… เช่น จะส่งของที่ขาดมาพรุ่งนี้" aria-label="ได้เรื่องว่าอย่างไร" />
                <div className="supply-chips supply-chips--wrap" role="radiogroup" aria-label="งานถัดไป">
                  {NEXT_STEPS.map((step) => (
                    <button key={step} type="button" role="radio" aria-checked={nextStep === step} className={nextStep === step ? "is-on" : ""} onClick={() => setNextStep(step)}>
                      {SUPPLY_NEXT_STEP_LABEL[step]}
                    </button>
                  ))}
                </div>
                {nextStep && nextStep !== "accept" ? (
                  <div className="supply-item__problem-row">
                    <label className="supply-item__got">
                      <span>นัดวัน</span>
                      <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
                    </label>
                    <input className="supply-item__note" value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" aria-label="รายละเอียดงานถัดไป" />
                  </div>
                ) : null}
                {nextStep === "resend" ? <p className="supply-board__hint">ระบบจะเปิดออเดอร์ &quot;ค้างส่ง&quot; ของที่ขาดให้ รอรับรอบหน้าในเช็คลิสต์เหมือนออเดอร์ปกติ</p> : null}
                <button
                  type="button"
                  className="supply-board__primary supply-board__primary--sm"
                  disabled={working || !outcome.trim() || !nextStep}
                  onClick={() => void send({ step: "decide", outcome, nextStep, nextNote, nextDueDate })}
                >
                  บันทึก
                </button>
              </div>
            ) : (
              <small>รอติดต่อซัพก่อน</small>
            )}
          </div>
        </li>

        {needsDone ? (
          <li className={followUp.doneAt ? "is-done" : ""}>
            <span className="supply-follow__mark" aria-hidden>{followUp.doneAt ? <Check size={14} /> : null}</span>
            <div className="supply-follow__body">
              <strong>{followUp.nextStep ? SUPPLY_NEXT_STEP_LABEL[followUp.nextStep] : ""} — เสร็จแล้วหรือยัง</strong>
              {followUp.doneAt ? (
                <small>
                  เสร็จแล้ว{followUp.doneNote ? ` · ${followUp.doneNote}` : ""} · {who(followUp.doneBy)}
                  {canAct ? (
                    <button type="button" className="supply-ord__text-btn" disabled={working} onClick={() => void send({ step: "undo-done" })}>
                      ย้อน
                    </button>
                  ) : null}
                </small>
              ) : canAct ? (
                <div className="supply-follow__form">
                  <input className="supply-item__note" value={doneNote} onChange={(e) => setDoneNote(e.target.value)} placeholder="เช่น ได้เงินคืน 120 บาทแล้ว" aria-label="โน้ตตอนเสร็จ" />
                  <button type="button" className="supply-board__primary supply-board__primary--sm" disabled={working} onClick={() => void send({ step: "done", doneNote })}>
                    เสร็จแล้ว ปิดเรื่อง
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ) : null}
      </ol>
      {followUp.backorderId ? <p className="supply-board__hint">เปิดออเดอร์ค้างส่งแล้ว — ของที่ขาดจะขึ้นรอรับในเช็คลิสต์ Stock</p> : null}
    </div>
  );
}
