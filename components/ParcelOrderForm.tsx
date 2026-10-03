"use client";

// ฟอร์มลงออเดอร์พัสดุการ์ด (เจ้าของร้าน): ร้าน/พ่อค้า · รูปที่พ่อค้าส่งมา · การ์ดแต่ละรายการ
// จะ "เก็บไว้ก่อน" หรือ "ลงแฟ้มขาย กี่บาท" · สาขาปลายทาง (default บางแค).
// ร่างเก็บใน localStorage ตลอด ปิดหน้าไปแล้วกลับมาก็ยังอยู่ — ล้างเมื่อบันทึกสำเร็จหรือกด "ล้างฟอร์ม".

import { useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { branchConfigs } from "../lib/store-config.ts";
import { DEFAULT_PARCEL_BRANCH, bangkokDate, type ParcelPlan } from "../lib/parcel-orders.ts";
import { saveParcelOrder, type ParcelDraft, type ParcelDraftItem } from "../lib/parcel-orders-store.ts";

const DRAFT_KEY = "sop-parcel-draft-v1";

const blankItem = (): ParcelDraftItem => ({ name: "", qty: 1, plan: "sell", price: "", note: "" });

function blankDraft(): ParcelDraft {
  return {
    branch: DEFAULT_PARCEL_BRANCH,
    seller: "",
    sellerLink: "",
    orderedDate: bangkokDate(new Date()),
    totalPaid: "",
    trackingNumber: "",
    note: "",
    sellerPhotos: [],
    items: [blankItem()]
  };
}

export function ParcelOrderForm({
  initial,
  orderId,
  onSaved,
  onCancel
}: {
  /** มี = แก้ออเดอร์เดิม (ไม่ใช้ร่างใน localStorage) */
  initial?: ParcelDraft;
  orderId?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(orderId);
  const [draft, setDraft] = useState<ParcelDraft>(initial ?? blankDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restored = useRef(false);

  useEffect(() => {
    if (editing || restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...blankDraft(), ...(JSON.parse(saved) as Partial<ParcelDraft>) });
    } catch {
      /* ร่างเสีย/อ่านไม่ได้ — เริ่มใหม่ */
    }
  }, [editing]);

  useEffect(() => {
    if (editing || !restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft, editing]);

  const set = <K extends keyof ParcelDraft>(key: K, value: ParcelDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setItem = (index: number, patch: Partial<ParcelDraftItem>) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  function reset() {
    setDraft(blankDraft());
    setError("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveParcelOrder(
        { ...draft, items: draft.items.filter((item) => item.name.trim()) },
        orderId
      );
      if (!editing) reset();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const sellTotal = draft.items.reduce(
    (sum, item) => sum + (item.plan === "sell" ? (Number(item.price) || 0) * (item.qty || 1) : 0),
    0
  );

  return (
    <form className="parcel-form" onSubmit={submit}>
      <div className="parcel-form__grid">
        <label>
          <span>ร้าน / พ่อค้า</span>
          <input value={draft.seller} onChange={(e) => set("seller", e.target.value)} placeholder="เช่น ร้าน Poke Card เฟซ" required />
        </label>
        <label>
          <span>ลิงก์เฟซ / แชท (ถ้ามี)</span>
          <input value={draft.sellerLink} onChange={(e) => set("sellerLink", e.target.value)} placeholder="https://facebook.com/…" inputMode="url" />
        </label>
        <label>
          <span>วันที่สั่ง</span>
          <input type="date" value={draft.orderedDate} onChange={(e) => set("orderedDate", e.target.value)} required />
        </label>
        <label>
          <span>ส่งไปสาขา</span>
          <select value={draft.branch} onChange={(e) => set("branch", e.target.value)}>
            {branchConfigs.map((branch) => (
              <option key={branch.key} value={branch.key}>
                {branch.shortName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>ยอดที่จ่ายพ่อค้า (บาท)</span>
          <input value={draft.totalPaid} onChange={(e) => set("totalPaid", e.target.value)} inputMode="decimal" placeholder="ไม่บังคับ" />
        </label>
        <label>
          <span>เลขพัสดุ (ถ้ามี)</span>
          <input value={draft.trackingNumber} onChange={(e) => set("trackingNumber", e.target.value)} placeholder="ไม่บังคับ" />
        </label>
      </div>

      <div className="parcel-form__photos">
        <EvidencePhotosInput
          value={draft.sellerPhotos.join("\n")}
          onChange={(value) => set("sellerPhotos", value.split("\n").filter(Boolean))}
          max={20}
          label="รูปจากพ่อค้า (การ์ดที่ซื้อ)"
        />
      </div>

      <div className="parcel-form__items">
        <p className="parcel-form__label">การ์ดที่ซื้อ — บอกแอดมินว่าแต่ละใบเอาไปทำอะไร</p>
        {draft.items.map((item, index) => (
          <div className="parcel-form__item" key={item.id ?? `new-${index}`}>
            <input
              className="parcel-form__name"
              value={item.name}
              onChange={(e) => setItem(index, { name: e.target.value })}
              placeholder="ชื่อการ์ด เช่น Pikachu ex SAR 247/191"
              aria-label="ชื่อการ์ด"
            />
            <input
              className="parcel-form__qty"
              value={item.qty}
              onChange={(e) => setItem(index, { qty: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })}
              inputMode="numeric"
              aria-label="จำนวน"
            />
            <div className="parcel-form__plan" role="radiogroup" aria-label="ทำอะไรกับการ์ดนี้">
              {(["sell", "keep"] as ParcelPlan[]).map((plan) => (
                <button
                  key={plan}
                  type="button"
                  role="radio"
                  aria-checked={item.plan === plan}
                  className={item.plan === plan ? "is-on" : ""}
                  onClick={() => setItem(index, { plan })}
                >
                  {plan === "sell" ? "ลงแฟ้มขาย" : "เก็บไว้ก่อน"}
                </button>
              ))}
            </div>
            {item.plan === "sell" ? (
              <input
                className="parcel-form__price"
                value={item.price}
                onChange={(e) => setItem(index, { price: e.target.value })}
                inputMode="decimal"
                placeholder="ราคาขาย ฿"
                aria-label="ราคาขาย"
              />
            ) : null}
            <input
              className="parcel-form__note"
              value={item.note}
              onChange={(e) => setItem(index, { note: e.target.value })}
              placeholder="หมายเหตุ เช่น ใส่ท็อปโหลดเดอร์"
              aria-label="หมายเหตุ"
            />
            <button
              type="button"
              className="parcel-form__remove"
              aria-label="ลบรายการนี้"
              disabled={draft.items.length === 1}
              onClick={() => setDraft((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="parcel-form__add" onClick={() => set("items", [...draft.items, blankItem()])}>
          <Plus size={16} aria-hidden /> เพิ่มการ์ด
        </button>
        {sellTotal > 0 ? <p className="parcel-form__sum">รวมราคาลงแฟ้ม {sellTotal.toLocaleString("th-TH")} บาท</p> : null}
      </div>

      <label className="parcel-form__wide">
        <span>ฝากบอกแอดมิน</span>
        <textarea value={draft.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="ไม่บังคับ" />
      </label>

      {error ? <p className="parcel-board__error">{error}</p> : null}

      <div className="parcel-form__actions">
        <button type="submit" className="parcel-board__new" disabled={busy}>
          {busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "ลงออเดอร์"}
        </button>
        {editing && onCancel ? (
          <button type="button" className="parcel-form__secondary" onClick={onCancel}>
            ยกเลิกการแก้ไข
          </button>
        ) : (
          <button type="button" className="parcel-form__secondary" onClick={reset}>
            <RotateCcw size={15} aria-hidden /> ล้างฟอร์ม
          </button>
        )}
      </div>
    </form>
  );
}
