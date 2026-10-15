"use client";

// "ออเดอร์ลูกค้า" — ทุกช่องทางในที่เดียว: ค้นด้วยเบอร์/ชื่อ → เห็นว่าสั่งอะไร จ่ายหรือยัง
// รับ/ส่งของหรือยัง → กดบันทึกการส่งมอบตรงนี้ได้เลย (ไม่ต้องไปเขียนในชีต).
// logic อยู่ที่ lib/customer-orders.ts · ข้อมูลจาก /api/customer-orders.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, PackageCheck, Phone, Search, Truck, Undo2, X } from "lucide-react";
import {
  FILTERS,
  HAND_LABEL,
  LOT_LABEL,
  PAY_LABEL,
  SOURCE_ADMIN,
  SOURCE_LABEL,
  isDone,
  isTodo,
  matchesFilter,
  matchesQuery,
  orderCounts,
  type CustomerOrder,
  type Filter,
  type FulfillmentRecord,
  type LotState,
  type OrderSource
} from "../lib/customer-orders.ts";

type Row = CustomerOrder & { record?: FulfillmentRecord };
type Feed = { orders: Row[]; lots: Record<OrderSource, LotState>; errors: string[]; isAdmin: boolean; canAct: boolean };

const REFRESH_MS = 60_000;
const PAGE = 60;
const QUERY_KEY = "sop-orders-query";

const baht = (n: number | null) => (n == null ? "" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const phoneText = (p: string) => (p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }) : "");

function payTone(o: Row) {
  if (o.pay === "paid") return "done";
  if (o.pay === "review" || o.pay === "deposit") return "arrived";
  if (o.pay === "unpaid") return "late";
  return "";
}
function handTone(o: Row) {
  if (isDone(o)) return "done";
  if (isTodo(o)) return "arrived";
  return "";
}

export function CustomerOrdersBoard({ initialFilter = "todo", initialQuery = "" }: { initialFilter?: Filter; initialQuery?: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<OrderSource | "">("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<{ key: string; mode: "ship" | "partial" } | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmUndo, setConfirmUndo] = useState("");

  // คำค้นค้างไว้ข้ามการรีเฟรช — ลูกค้ายืนรออยู่หน้าร้าน ห้ามหาย
  useEffect(() => {
    if (initialQuery) return;
    try {
      const saved = sessionStorage.getItem(QUERY_KEY);
      if (saved) setQuery(saved);
    } catch {}
  }, [initialQuery]);
  useEffect(() => {
    try {
      sessionStorage.setItem(QUERY_KEY, query);
    } catch {}
  }, [query]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/customer-orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "โหลดไม่สำเร็จ");
      setFeed(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  const post = async (body: Record<string, unknown>, okKey: string) => {
    setBusy(okKey);
    try {
      const res = await fetch("/api/customer-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "บันทึกไม่สำเร็จ");
      setOpen(null);
      setDraft("");
      setConfirmUndo("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const orders = feed?.orders || [];
  const bySource = useMemo(() => (source ? orders.filter((o) => o.source === source) : orders), [orders, source]);
  const searched = useMemo(() => bySource.filter((o) => matchesQuery(o, query)), [bySource, query]);
  const counts = useMemo(() => orderCounts(searched), [searched]);
  // มีคำค้น = หาออเดอร์ของลูกค้าคนนี้ → โชว์ทุกสถานะ ไม่ให้ตัวกรองซ่อนออเดอร์ที่เขาถามถึง
  const shown = useMemo(() => (query.trim() ? searched : searched.filter((o) => matchesFilter(o, filter))), [searched, filter, query]);
  const sources = useMemo(() => [...new Set(orders.map((o) => o.source))], [orders]);

  return (
    <article className="task-section parcel-board orders-board">
      <div className="task-section-head">
        <div>
          <p className="eyebrow">ออเดอร์ทุกช่องทางในที่เดียว</p>
          <h3>ออเดอร์ลูกค้า</h3>
        </div>
        <span className={`status-pill ${counts.todo ? "is-late" : ""}`}>{feed ? (counts.todo ? `ต้องส่งมอบ ${counts.todo}` : "ไม่มีของค้างส่ง") : "กำลังโหลด"}</span>
      </div>

      <p className="parcel-board__hint">
        ลูกค้ามารับของ หรือทักมาถามออเดอร์ → พิมพ์เบอร์ (กี่ตัวท้ายก็ได้) หรือชื่อ แล้วกดบันทึกที่นี่ที่เดียว
        ไม่ต้องไปเขียนในชีต · รวมร้านออนไลน์ พรีออเดอร์ทุกล็อต และ Pre-release
      </p>

      <label className="orders-board__search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          inputMode="search"
          placeholder="เบอร์โทร ชื่อ หรือเลขออเดอร์"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="ค้นออเดอร์"
        />
        {query ? (
          <button type="button" aria-label="ล้างคำค้น" onClick={() => setQuery("")}>
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </label>

      <div className="parcel-board__toolbar">
        {query.trim() ? (
          <p className="orders-board__found">พบ {searched.length} ออเดอร์ (ทุกสถานะ)</p>
        ) : (
          <div className="delivery-board__filters" role="tablist" aria-label="ตัวกรองออเดอร์">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={filter === f.value ? "delivery-board__filter is-on" : "delivery-board__filter"}
                onClick={() => {
                  setFilter(f.value);
                  setLimit(PAGE);
                }}
              >
                {f.label} {feed ? counts[f.value] : ""}
              </button>
            ))}
          </div>
        )}
        <select className="orders-board__source" value={source} onChange={(e) => setSource(e.target.value as OrderSource | "")} aria-label="ช่องทาง">
          <option value="">ทุกช่องทาง</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {feed?.errors.length ? (
        <p className="parcel-board__error" role="alert">
          โหลดบางช่องทางไม่ได้: {feed.errors.join(" · ")}
        </p>
      ) : null}
      {error ? (
        <p className="parcel-board__error" role="alert">
          {error}
        </p>
      ) : null}

      {feed?.isAdmin && feed.canAct ? <ArrivalSwitches feed={feed} busy={busy} post={post} /> : null}

      {feed && !shown.length ? (
        <p className="delivery-board__empty">
          {query.trim() ? "ไม่พบออเดอร์ของคำค้นนี้ ลองพิมพ์เบอร์ 4 ตัวท้าย หรือชื่อเล่น" : filter === "todo" ? "ไม่มีของค้างส่งมอบ" : "ไม่มีรายการ"}
        </p>
      ) : null}

      <ul className="parcel-board__list">
        {shown.slice(0, limit).map((o) => (
          <li key={o.key} className="parcel-order orders-row">
            <div className="parcel-order__head">
              <div className="parcel-order__title">
                <p className="parcel-order__meta">
                  {SOURCE_LABEL[o.source]} · {o.ref}
                  {o.createdAt ? ` · สั่ง ${day(o.createdAt)}` : ""}
                </p>
                <strong>{o.name}</strong>
              </div>
              <span className={`parcel-order__pill parcel-order__pill--${handTone(o)}`}>{HAND_LABEL[o.hand]}</span>
            </div>

            <p className="orders-row__items">{o.items || "-"}</p>

            <div className="orders-row__facts">
              {o.phone ? (
                <a className="orders-row__phone" href={`tel:${o.phone}`}>
                  <Phone size={14} aria-hidden />
                  {phoneText(o.phone)}
                </a>
              ) : null}
              {o.total != null ? <span>{baht(o.total)}</span> : null}
              <span className={`parcel-order__pill parcel-order__pill--${payTone(o)}`} title={o.payText}>
                {PAY_LABEL[o.pay]}
              </span>
              <span>{o.method === "ship" ? "จัดส่ง" : o.method === "pickup" ? "รับที่ร้าน" : "งานแข่ง"}</span>
            </div>

            {o.due ? <p className="parcel-order__note">เก็บเงินส่วนที่เหลือ {baht(o.due)} ก่อนส่งของ</p> : null}
            {o.pay !== "paid" && o.payText !== PAY_LABEL[o.pay] ? <p className="parcel-order__meta">สถานะจ่าย: {o.payText}</p> : null}
            {o.handText !== HAND_LABEL[o.hand] ? <p className="parcel-order__status">{o.handText}</p> : null}
            {o.address ? <p className="parcel-order__meta">ที่อยู่: {o.address}</p> : null}
            {o.note ? <p className="parcel-order__meta">หมายเหตุ: {o.note}</p> : null}

            {feed?.canAct ? (
              <div className="orders-row__actions">
                {isTodo(o) && o.method === "pickup" ? (
                  <>
                    <button type="button" className="parcel-board__new" disabled={busy === o.key} onClick={() => void post({ action: "hand", key: o.key, state: "picked_up" }, o.key)}>
                      <PackageCheck size={16} aria-hidden />
                      ลูกค้ารับแล้ว
                    </button>
                    <button type="button" className="parcel-board__receive" onClick={() => { setOpen({ key: o.key, mode: "partial" }); setDraft(""); }}>
                      รับไปบางส่วน
                    </button>
                  </>
                ) : null}
                {isTodo(o) && o.method === "ship" ? (
                  <button type="button" className="parcel-board__new" onClick={() => { setOpen({ key: o.key, mode: "ship" }); setDraft(""); }}>
                    <Truck size={16} aria-hidden />
                    ส่งแล้ว
                  </button>
                ) : null}
                {o.record ? (
                  confirmUndo === o.key ? (
                    <button type="button" className="parcel-board__receive orders-row__undo-confirm" disabled={busy === o.key} onClick={() => void post({ action: "undo", key: o.key }, o.key)}>
                      <Undo2 size={16} aria-hidden />
                      กดอีกครั้งเพื่อยกเลิกที่บันทึก
                    </button>
                  ) : (
                    <button type="button" className="parcel-board__receive" onClick={() => setConfirmUndo(o.key)}>
                      <Undo2 size={16} aria-hidden />
                      บันทึกผิด ยกเลิก
                    </button>
                  )
                ) : null}
                <a className="orders-row__source" href={SOURCE_ADMIN[o.source].url} target="_blank" rel="noreferrer">
                  ดูต้นทาง: {SOURCE_ADMIN[o.source].label}
                  <ExternalLink size={14} aria-hidden />
                </a>
              </div>
            ) : null}

            {open?.key === o.key ? (
              <form
                className="orders-row__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void post(
                    open.mode === "ship"
                      ? { action: "hand", key: o.key, state: "shipped", tracking: draft }
                      : { action: "hand", key: o.key, state: "partial", note: draft },
                    o.key
                  );
                }}
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={open.mode === "ship" ? "เลขพัสดุ (ถ้ามี)" : "รับอะไรไปแล้ว เหลืออะไร เช่น รับบ็อคแล้ว เหลือเพลย์แมต"}
                  required={open.mode === "partial"}
                  aria-label={open.mode === "ship" ? "เลขพัสดุ" : "รายละเอียดที่รับไป"}
                />
                <button type="submit" className="parcel-board__new" disabled={busy === o.key}>
                  <Check size={16} aria-hidden />
                  บันทึก
                </button>
                <button type="button" className="parcel-board__receive" onClick={() => setOpen(null)}>
                  ยกเลิก
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {shown.length > limit ? (
        <button type="button" className="parcel-board__receive orders-board__more" onClick={() => setLimit((n) => n + PAGE)}>
          ดูเพิ่มอีก {Math.min(PAGE, shown.length - limit)} รายการ
        </button>
      ) : null}
    </article>
  );
}

/** เจ้าของร้าน: สถานะแต่ละล็อต — ยังไม่ถึง = ไม่โผล่ในงานน้อง · ปิดล็อต = ส่งมอบครบแล้วทั้งล็อต */
const LOTS: LotState[] = ["waiting", "open", "closed"];
function ArrivalSwitches({ feed, busy, post }: { feed: Feed; busy: string; post: (b: Record<string, unknown>, k: string) => Promise<void> }) {
  const pre: OrderSource[] = ["set14", "bundle", "ma6", "lorcana13", "mat"];
  return (
    <details className="orders-board__arrival">
      <summary>สถานะล็อตพรีออเดอร์ (เจ้าของร้าน)</summary>
      <p className="parcel-order__meta">
        ยังไม่ถึงร้าน = ออเดอร์ขึ้น "รอของเข้าร้าน" ไม่โผล่ในงานน้อง · ส่งมอบครบแล้ว = ปิดทั้งล็อต (ใช้กับล็อตเก่าที่ส่งของไปหมดแล้ว)
      </p>
      <ul>
        {pre.map((s) => (
          <li key={s}>
            <span>{SOURCE_LABEL[s]}</span>
            <span className="orders-board__lot" role="group" aria-label={SOURCE_LABEL[s]}>
              {LOTS.map((lot) => (
                <button
                  key={lot}
                  type="button"
                  className={feed.lots[s] === lot ? "delivery-board__filter is-on" : "delivery-board__filter"}
                  disabled={busy === `lot-${s}`}
                  aria-pressed={feed.lots[s] === lot}
                  onClick={() => feed.lots[s] !== lot && void post({ action: "lot", source: s, lot }, `lot-${s}`)}
                >
                  {LOT_LABEL[lot]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
