"use client";

// ลงออเดอร์ของเติมสต็อกที่สั่งไปแล้ว (น้ำ ขนม accessory): อัปรูปรายการที่สั่ง → กด "อ่านรายการจากรูป"
// → ระบบแตกเป็นรายการ ให้ตรวจ/แก้ → บันทึก. ของในรายการจะขึ้นว่า "สั่งแล้ว รอของมาส่ง" ในหน้า
// ของที่ต้องสั่ง กันสั่งซ้ำ. ร่างเก็บใน localStorage ปิดหน้าไปก็ไม่หาย — ล้างเมื่อบันทึกหรือกดล้างฟอร์ม.

import { useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, ScanText, Trash2 } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { branchConfigs } from "../lib/store-config.ts";
import { DEFAULT_SUPPLY_BRANCH, bangkokDate } from "../lib/supply-orders.ts";
import { readOrderPhotos, saveSupplyOrder, type SupplyDraft, type SupplyDraftItem } from "../lib/supply-orders-store.ts";

const DRAFT_KEY = "sop-supply-order-draft-v1";

const blankItem = (): SupplyDraftItem => ({ name: "", qty: 1, unit: "" });

function blankDraft(branch?: string): SupplyDraft {
  return {
    branch: branch || DEFAULT_SUPPLY_BRANCH,
    supplier: "Makro",
    orderedDate: bangkokDate(new Date()),
    total: "",
    note: "",
    photos: [],
    items: [],
    aiRead: false
  };
}

export function SupplyOrderForm({
  branch,
  initial,
  orderId,
  onSaved,
  onCancel
}: {
  branch?: string;
  /** มี = แก้ออเดอร์เดิม (ไม่ใช้ร่าง) */
  initial?: SupplyDraft;
  orderId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const editing = Boolean(orderId);
  const [draft, setDraft] = useState<SupplyDraft>(initial ?? blankDraft(branch));
  const [busy, setBusy] = useState<"" | "read" | "save">("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const restored = useRef(false);

  useEffect(() => {
    if (editing || restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...blankDraft(branch), ...(JSON.parse(saved) as Partial<SupplyDraft>) });
    } catch {
      /* ร่างเสีย — เริ่มใหม่ */
    }
  }, [editing, branch]);

  useEffect(() => {
    if (editing || !restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft, editing]);

  const set = <K extends keyof SupplyDraft>(key: K, value: SupplyDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setItem = (index: number, patch: Partial<SupplyDraftItem>) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  function reset() {
    setDraft(blankDraft(branch));
    setError("");
    setInfo("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function readPhotos() {
    setBusy("read");
    setError("");
    setInfo("");
    try {
      const result = await readOrderPhotos(draft.photos, draft.branch);
      setDraft((prev) => ({
        ...prev,
        supplier: result.supplier || prev.supplier,
        orderedDate: result.orderedDate && result.orderedDate <= bangkokDate(new Date()) ? result.orderedDate : prev.orderedDate,
        total: result.total ? String(result.total) : prev.total,
        items: result.items.map((item) => ({ name: item.name, qty: item.qty, unit: item.unit || "", productId: item.productId })),
        aiRead: true
      }));
      setInfo(`อ่านได้ ${result.items.length} รายการ — เทียบกับรูปอีกที แก้ชื่อ/จำนวนที่ผิดก่อนบันทึก`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "อ่านรูปไม่สำเร็จ");
      if (!draft.items.length) set("items", [blankItem()]);
    } finally {
      setBusy("");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      await saveSupplyOrder(draft, orderId);
      if (!editing) reset();
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  const filled = draft.items.filter((item) => item.name.trim());
  const canSave = draft.photos.length > 0 && filled.length > 0 && !busy;

  return (
    <form className="supply-form" onSubmit={submit}>
      <p className="supply-board__hint">
        สั่งของเสร็จแล้ว ถ่ายรูป/แคปรายการที่สั่งทั้งหมด (บิล หรือหน้าจอแอป Makro) แล้วกด &quot;อ่านรายการจากรูป&quot; —
        ของพวกนี้จะขึ้นว่า &quot;สั่งแล้ว รอของมาส่ง&quot; คนอื่นจะไม่สั่งซ้ำ
      </p>

      <EvidencePhotosInput
        value={draft.photos.join("\n")}
        onChange={(value) => set("photos", value.split("\n").filter(Boolean))}
        max={6}
        label="รูปรายการที่สั่ง (อย่างน้อย 1 รูป)"
      />

      <button type="button" className="supply-form__read" disabled={!draft.photos.length || Boolean(busy)} onClick={() => void readPhotos()}>
        <ScanText size={18} aria-hidden />
        {busy === "read" ? "กำลังอ่านรูป… (ราว 10–20 วินาที)" : draft.items.length ? "อ่านจากรูปใหม่อีกรอบ" : "อ่านรายการจากรูป"}
      </button>
      {info ? <p className="supply-form__info">{info}</p> : null}

      <div className="supply-form__grid">
        <label>
          <span>สั่งจาก</span>
          <input value={draft.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Makro" />
        </label>
        <label>
          <span>วันที่สั่ง</span>
          <input type="date" value={draft.orderedDate} max={bangkokDate(new Date())} onChange={(e) => set("orderedDate", e.target.value)} />
        </label>
        <label>
          <span>ยอดรวม (บาท)</span>
          <input inputMode="decimal" value={draft.total} onChange={(e) => set("total", e.target.value)} placeholder="ไม่บังคับ" />
        </label>
        <label>
          <span>ส่งมาที่สาขา</span>
          <select value={draft.branch} onChange={(e) => set("branch", e.target.value)}>
            {branchConfigs.map((option) => (
              <option key={option.key} value={option.key}>
                {option.shortName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draft.items.length ? (
        <div className="supply-form__items">
          <p className="supply-form__label">รายการที่สั่ง {filled.length} รายการ</p>
          {draft.items.map((item, index) => (
            <div key={item.id || `new-${index}`} className="supply-form__item">
              <input
                className="supply-form__name"
                value={item.name}
                onChange={(e) => setItem(index, { name: e.target.value, productId: undefined })}
                placeholder="ชื่อสินค้า"
                aria-label={`ชื่อสินค้ารายการที่ ${index + 1}`}
              />
              <input
                className="supply-form__qty"
                inputMode="numeric"
                value={item.qty}
                onChange={(e) => setItem(index, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                aria-label="จำนวน"
              />
              <input className="supply-form__unit" value={item.unit} onChange={(e) => setItem(index, { unit: e.target.value })} placeholder="หน่วย" aria-label="หน่วย" />
              <button
                type="button"
                className="supply-form__remove"
                aria-label={`ลบ ${item.name || "รายการนี้"}`}
                onClick={() => set("items", draft.items.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" className="supply-form__add" onClick={() => set("items", [...draft.items, blankItem()])}>
        <Plus size={16} aria-hidden /> เพิ่มรายการเอง
      </button>

      <label className="supply-form__wide">
        <span>โน้ต</span>
        <textarea value={draft.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="เช่น นัดส่งพรุ่งนี้บ่าย" />
      </label>

      {error ? (
        <p className="supply-board__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="supply-form__actions">
        <button type="submit" className="supply-board__primary" disabled={!canSave}>
          {busy === "save" ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "บันทึก — สั่งแล้ว รอของมาส่ง"}
        </button>
        <button type="button" className="supply-board__secondary" onClick={onCancel}>
          ปิด
        </button>
        {editing ? null : (
          <button type="button" className="supply-board__secondary" onClick={reset}>
            <RotateCcw size={15} aria-hidden /> ล้างฟอร์ม
          </button>
        )}
      </div>
    </form>
  );
}
