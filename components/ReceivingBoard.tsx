"use client";

// รับของเข้า — รายการบิล · ฟอร์มลงบิลใหม่ · หน้ารายละเอียด (เจ้าของใส่ทุน/ยืนยัน/ยกเลิก)
// ร่างบิลเก็บใน localStorage ปิดหน้าไปก็ไม่หาย — ล้างเมื่อบันทึกสำเร็จหรือกด "ล้างฟอร์ม".
// ทุนต่อชิ้นมาจาก server เฉพาะเจ้าของเท่านั้น (คนอื่นได้ null) — หน้าจอไม่ได้เป็นตัวกันเอง.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { branchConfigs, branchShortName } from "../lib/store-config.ts";
import {
  LINE_OWNER_LABEL,
  STATUS_CANCELLED,
  STATUS_CONFIRMED,
  STATUS_PENDING,
  receivingTotal,
  type LineOwner,
  type ProductOption,
  type Receiving
} from "../lib/receivings.ts";

type Feed = { receivings: Receiving[]; dealers: string[]; isOwner: boolean };
type DraftLine = { productId: string; sku: string; name: string; qty: string; owner: LineOwner; unitCostExVat: string };
type Draft = { branch: string; date: string; dealer: string; billNo: string; billPhoto: string; note: string; lines: DraftLine[] };

const DRAFT_KEY = "sop-receiving-draft-v1";
const FILTERS = ["ทั้งหมด", STATUS_PENDING, STATUS_CONFIRMED, STATUS_CANCELLED] as const;

const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const blank = (): Draft => ({ branch: branchConfigs[0].key, date: today(), dealer: "", billNo: "", billPhoto: "", note: "", lines: [] });
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (date: string) =>
  new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; id?: string }> {
  let res: Response;
  try {
    res = await fetch("/api/receivings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("ส่งไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่");
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: string; error?: string; ok?: boolean; id?: string };
  if (!res.ok) {
    if (data.error === "read_only_view") throw new Error("โหมดดูอย่างเดียว — ทำรายการไม่ได้");
    if (data.error === "forbidden") throw new Error("ต้องเป็นเจ้าของร้านถึงจะทำรายการนี้ได้");
    throw new Error(data.detail || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return data;
}

function StatusTag({ status }: { status: Receiving["status"] }) {
  const tone = status === STATUS_CONFIRMED ? "is-ok" : status === STATUS_CANCELLED ? "is-off" : "is-wait";
  return <span className={`rcv-status ${tone}`}>{status}</span>;
}

function ProductPicker({ onPick }: { onPick: (product: ProductOption) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/receivings/products?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: "no-store" });
        const data = (await res.json()) as { products?: ProductOption[] };
        if (!res.ok) throw new Error();
        setResults(data.products ?? []);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") setError("ค้นสินค้าไม่สำเร็จ ลองใหม่");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="rcv-picker">
      <label className="rcv-picker__field">
        <Search size={17} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นชื่อสินค้า / SKU / สแกนบาร์โค้ด"
          aria-label="ค้นหาสินค้า"
          enterKeyHint="search"
        />
      </label>
      {loading ? <p className="rcv-muted">กำลังค้น…</p> : null}
      {error ? <p className="sdoc-error">{error}</p> : null}
      {results.length ? (
        <ul className="rcv-picker__results">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(product);
                  setQuery("");
                  setResults([]);
                }}
              >
                <span className="rcv-line__name">{product.name || "(ไม่มีชื่อ)"}</span>
                <small>{[product.sku, product.barcode].filter(Boolean).join(" · ") || "ไม่มี SKU"}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !loading && !error ? (
        <p className="rcv-muted">ไม่เจอสินค้า ลองพิมพ์คำอื่น</p>
      ) : null}
    </div>
  );
}

function NewReceivingForm({ owner, dealers, onSaved, onClose }: { owner: boolean; dealers: string[]; onSaved: (id: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...blank(), ...(JSON.parse(saved) as Partial<Draft>) });
    } catch {
      /* ร่างเสีย — เริ่มใหม่ */
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setDraft((prev) => ({ ...prev, lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));

  function addProduct(product: ProductOption) {
    setDraft((prev) => {
      const existing = prev.lines.findIndex((line) => line.productId === product.id);
      if (existing >= 0) {
        return { ...prev, lines: prev.lines.map((line, i) => (i === existing ? { ...line, qty: String((Number(line.qty) || 0) + 1) } : line)) };
      }
      return { ...prev, lines: [...prev.lines, { productId: product.id, sku: product.sku, name: product.name, qty: "1", owner: "shop", unitCostExVat: "" }] };
    });
  }

  function reset() {
    setDraft(blank());
    setError("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  const ready = draft.billPhoto && draft.dealer.trim() && draft.lines.length > 0 && draft.lines.every((line) => Number(line.qty) > 0);
  const total = owner
    ? draft.lines.reduce((sum, line) => (line.owner === "shop" ? sum + (Number(line.qty) || 0) * (Number(line.unitCostExVat) || 0) : sum), 0)
    : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const result = await post({
        action: "create",
        branch: draft.branch,
        date: draft.date,
        dealer: draft.dealer,
        billNo: draft.billNo,
        billPhotoUrl: draft.billPhoto,
        note: draft.note,
        lines: draft.lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          name: line.name,
          qty: Number(line.qty),
          owner: line.owner,
          unitCostExVat: owner && line.owner === "shop" && line.unitCostExVat !== "" ? Number(line.unitCostExVat) : null
        }))
      });
      reset();
      onSaved(result.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="parcel-form rcv-form" onSubmit={submit}>
      <div className="parcel-form__grid">
        <label>
          <span>สาขาที่รับของ</span>
          <select value={draft.branch} onChange={(e) => set("branch", e.target.value)}>
            {branchConfigs.map((branch) => (
              <option key={branch.key} value={branch.key}>
                {branch.shortName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>วันที่รับของ</span>
          <input type="date" value={draft.date} max={today()} onChange={(e) => set("date", e.target.value)} />
        </label>
        <label>
          <span>ร้าน / ดีลเลอร์</span>
          <input list="rcv-dealers" value={draft.dealer} onChange={(e) => set("dealer", e.target.value)} placeholder="พิมพ์หรือเลือกร้านเดิม" />
          <datalist id="rcv-dealers">
            {dealers.map((dealer) => (
              <option key={dealer} value={dealer} />
            ))}
          </datalist>
        </label>
        <label>
          <span>เลขที่บิล</span>
          <input value={draft.billNo} onChange={(e) => set("billNo", e.target.value)} placeholder="ไม่มีก็เว้นไว้" />
        </label>
      </div>

      <div>
        <EvidencePhotosInput value={draft.billPhoto} onChange={(value) => set("billPhoto", value.split("\n")[0] || "")} max={1} label="รูปบิล (ต้องมี)" />
      </div>

      <div>
        <p className="parcel-form__label">สินค้าที่รับเข้า</p>
        <ProductPicker onPick={addProduct} />
        {draft.lines.length ? (
          <ul className="rcv-lines">
            {draft.lines.map((line, index) => (
              <li key={line.productId} className="rcv-line">
                <div className="rcv-line__head">
                  <span className="rcv-line__name">{line.name}</span>
                  <small>{line.sku || "ไม่มี SKU"}</small>
                </div>
                <div className="rcv-line__controls">
                  <label className="rcv-line__qty">
                    <span>จำนวน</span>
                    <input inputMode="numeric" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value.replace(/[^\d]/g, "") })} />
                  </label>
                  <label className="rcv-line__owner">
                    <span>เจ้าของสินค้า</span>
                    <select value={line.owner} onChange={(e) => setLine(index, { owner: e.target.value as LineOwner })}>
                      <option value="shop">{LINE_OWNER_LABEL.shop}</option>
                      <option value="champ">{LINE_OWNER_LABEL.champ}</option>
                    </select>
                  </label>
                  {owner && line.owner === "shop" ? (
                    <label className="rcv-line__cost">
                      <span>ทุน/ชิ้น ก่อน VAT</span>
                      <input inputMode="decimal" value={line.unitCostExVat} onChange={(e) => setLine(index, { unitCostExVat: e.target.value.replace(/[^\d.]/g, "") })} placeholder="ใส่ทีหลังได้" />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="parcel-form__remove"
                    aria-label={`เอา ${line.name} ออก`}
                    onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 size={17} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rcv-muted">ยังไม่มีสินค้า — ค้นแล้วแตะชื่อเพื่อเพิ่ม</p>
        )}
        {owner && draft.lines.length ? <p className="parcel-form__sum">รวมทุนของร้าน (ก่อน VAT) {baht(total)} บาท</p> : null}
        {!owner ? <p className="rcv-muted">ทุนต่อชิ้นให้เจ้าของใส่ทีหลัง</p> : null}
      </div>

      <label className="parcel-form__wide">
        <span>หมายเหตุ</span>
        <textarea rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น ของขาด 1 กล่อง รอร้านส่งตาม" />
      </label>

      {error ? <p className="sdoc-error" role="alert">{error}</p> : null}

      <div className="parcel-form__actions">
        <button type="submit" className="parcel-board__new" disabled={busy || !ready}>
          {busy ? "กำลังบันทึก…" : "บันทึกรับของ"}
        </button>
        <button type="button" className="parcel-form__secondary" onClick={onClose}>
          ปิด
        </button>
        <button type="button" className="parcel-form__secondary" onClick={reset}>
          <RotateCcw size={15} aria-hidden /> ล้างฟอร์ม
        </button>
      </div>
      {!ready ? <p className="rcv-muted">ต้องมีรูปบิล ชื่อร้าน และสินค้าอย่างน้อย 1 รายการ</p> : null}
    </form>
  );
}

function ReceivingDetail({ receiving, owner, onBack, onChanged }: { receiving: Receiving; owner: boolean; onBack: () => void; onChanged: () => void }) {
  const [costs, setCosts] = useState<string[]>(() => receiving.lines.map((line) => (line.unitCostExVat == null ? "" : String(line.unitCostExVat))));
  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const pending = receiving.status === STATUS_PENDING;
  const editing = owner && pending;
  const liveTotal = receivingTotal({
    lines: receiving.lines.map((line, i) => ({ ...line, unitCostExVat: costs[i] === "" ? null : Number(costs[i]) }))
  });

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await work();
      setSaved(done);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const payloadCosts = () => costs.map((value) => (value === "" ? null : Number(value)));

  return (
    <section className="sdoc-section rcv-detail">
      <button type="button" className="rcv-back" onClick={onBack}>
        <ChevronLeft size={18} aria-hidden /> รายการทั้งหมด
      </button>
      <div className="rcv-detail__head">
        <div>
          <p className="eyebrow">{branchShortName(receiving.branch)} · {thaiDate(receiving.date)}</p>
          <h3>{receiving.dealer}</h3>
          <p className="rcv-muted">
            {receiving.billNo ? `บิล ${receiving.billNo} · ` : ""}ลงโดย {receiving.createdBy}
            {receiving.approvedBy ? ` · ยืนยันโดย ${receiving.approvedBy}` : ""}
          </p>
        </div>
        <StatusTag status={receiving.status} />
      </div>

      {receiving.billPhotoUrl ? (
        <a href={receiving.billPhotoUrl} target="_blank" rel="noreferrer" className="rcv-bill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={receiving.billPhotoUrl} alt="รูปบิล" loading="lazy" />
          <span>เปิดรูปบิลเต็ม</span>
        </a>
      ) : null}

      <ul className="rcv-lines">
        {receiving.lines.map((line, index) => (
          <li key={`${line.productId}-${index}`} className="rcv-line">
            <div className="rcv-line__head">
              <span className="rcv-line__name">{line.name}</span>
              <small>
                {line.sku || "ไม่มี SKU"} · {line.qty} ชิ้น
                {line.owner === "champ" ? ` · ${LINE_OWNER_LABEL.champ}` : ""}
              </small>
            </div>
            {owner && line.owner === "shop" ? (
              editing ? (
                <label className="rcv-line__cost">
                  <span>ทุน/ชิ้น ก่อน VAT</span>
                  <input
                    inputMode="decimal"
                    value={costs[index]}
                    onChange={(e) => setCosts((prev) => prev.map((v, i) => (i === index ? e.target.value.replace(/[^\d.]/g, "") : v)))}
                  />
                </label>
              ) : (
                <span className="rcv-line__money">{line.unitCostExVat == null ? "-" : `${baht(line.unitCostExVat)} × ${line.qty}`}</span>
              )
            ) : null}
          </li>
        ))}
      </ul>

      {owner ? (
        <p className="rcv-total">
          รวมทุนของร้าน (ก่อน VAT) <strong>{liveTotal == null ? "ยังใส่ทุนไม่ครบ" : `${baht(liveTotal)} บาท`}</strong>
        </p>
      ) : pending ? (
        <p className="sdoc-help">รอเจ้าของใส่ทุนและยืนยัน</p>
      ) : null}
      {receiving.note ? <p className="rcv-muted">หมายเหตุ: {receiving.note}</p> : null}
      {receiving.status === STATUS_CANCELLED ? <p className="sdoc-help">ยกเลิกโดย {receiving.cancelledBy} · {receiving.cancelReason}</p> : null}

      {error ? <p className="sdoc-error" role="alert">{error}</p> : null}
      {saved ? <p className="rcv-saved">{saved}</p> : null}

      {editing ? (
        <div className="parcel-form__actions">
          <button
            type="button"
            className="parcel-board__new"
            disabled={busy || liveTotal == null}
            onClick={() =>
              run(async () => {
                await post({ action: "setCosts", id: receiving.id, costs: payloadCosts() });
                await post({ action: "confirm", id: receiving.id });
              }, "ยืนยันแล้ว อัปเดตทุนเฉลี่ยเรียบร้อย")
            }
          >
            <Check size={17} aria-hidden /> ยืนยัน คิดทุนเฉลี่ย
          </button>
          <button type="button" className="parcel-form__secondary" disabled={busy} onClick={() => run(() => post({ action: "setCosts", id: receiving.id, costs: payloadCosts() }), "บันทึกทุนไว้แล้ว")}>
            บันทึกทุนไว้ก่อน
          </button>
        </div>
      ) : null}

      {owner && receiving.status !== STATUS_CANCELLED ? (
        cancelOpen ? (
          <div className="rcv-cancel">
            <label className="parcel-form__wide">
              <span>เหตุผลที่ยกเลิก (ต้องใส่)</span>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลงบิลซ้ำ / ร้านคืนของ" />
            </label>
            <div className="parcel-form__actions">
              <button type="button" className="rcv-danger" disabled={busy || !reason.trim()} onClick={() => run(() => post({ action: "cancel", id: receiving.id, reason }), "ยกเลิกแล้ว คำนวณทุนใหม่เรียบร้อย")}>
                ยืนยันยกเลิก
              </button>
              <button type="button" className="parcel-form__secondary" onClick={() => setCancelOpen(false)}>
                <X size={15} aria-hidden /> ไม่ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="rcv-link-danger" onClick={() => setCancelOpen(true)}>
            ยกเลิกบิลนี้
          </button>
        )
      ) : null}
    </section>
  );
}

export function ReceivingBoard() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "new" | string>("list");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ทั้งหมด");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/receivings", { cache: "no-store" });
      const data = (await res.json()) as Feed & { error?: string };
      if (!res.ok) throw new Error(data.error === "forbidden" ? "หน้านี้สำหรับแอดมิน" : "โหลดรายการไม่สำเร็จ");
      setFeed(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายการไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
    // เปิดฟอร์มต่อถ้ามีร่างค้าง
    try {
      if (localStorage.getItem(DRAFT_KEY)) setView("new");
    } catch {
      /* ignore */
    }
  }, [load]);

  const list = useMemo(() => (feed?.receivings ?? []).filter((r) => filter === "ทั้งหมด" || r.status === filter), [feed, filter]);
  const pendingCount = (feed?.receivings ?? []).filter((r) => r.status === STATUS_PENDING).length;
  const owner = Boolean(feed?.isOwner);

  if (error) return <p className="sdoc-error">{error}</p>;
  if (!feed) return <p className="rcv-muted">กำลังโหลด…</p>;

  if (view === "new") {
    return (
      <section className="sdoc-section">
        <p className="eyebrow">ลงบิลรับของ</p>
        <NewReceivingForm
          owner={owner}
          dealers={feed.dealers}
          onClose={() => setView("list")}
          onSaved={(id) => {
            void load();
            setView(id || "list");
          }}
        />
      </section>
    );
  }

  const detail = view !== "list" ? feed.receivings.find((r) => r.id === view) : undefined;
  if (detail) return <ReceivingDetail key={`${detail.id}-${detail.status}`} receiving={detail} owner={owner} onBack={() => setView("list")} onChanged={load} />;

  return (
    <section className="sdoc-section">
      <div className="rcv-toolbar">
        <button type="button" className="parcel-board__new" onClick={() => setView("new")}>
          <Plus size={17} aria-hidden /> รับของเข้า
        </button>
        {owner && pendingCount ? <p className="rcv-muted">รอใส่ทุน {pendingCount} บิล</p> : null}
      </div>
      <nav className="stock-loss-tabs" aria-label="สถานะ">
        {FILTERS.map((option) => (
          <a
            key={option}
            href="#"
            className={filter === option ? "is-active" : undefined}
            aria-current={filter === option ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setFilter(option);
            }}
          >
            {option}
          </a>
        ))}
      </nav>
      {list.length ? (
        <ul className="rcv-list">
          {list.map((receiving) => {
            const qty = receiving.lines.reduce((sum, line) => sum + line.qty, 0);
            const total = owner ? receivingTotal(receiving) : null;
            return (
              <li key={receiving.id}>
                <button type="button" onClick={() => setView(receiving.id)}>
                  <span className="rcv-list__main">
                    <span className="rcv-line__name">{receiving.dealer}</span>
                    <small>
                      {thaiDate(receiving.date)} · {branchShortName(receiving.branch)} · {receiving.lines.length} รายการ {qty} ชิ้น
                      {receiving.billNo ? ` · บิล ${receiving.billNo}` : ""}
                    </small>
                  </span>
                  <span className="rcv-list__side">
                    <StatusTag status={receiving.status} />
                    {owner && total != null ? <small>{baht(total)} ฿</small> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rcv-muted">ยังไม่มีบิล{filter === "ทั้งหมด" ? "" : `ที่${filter}`}</p>
      )}
    </section>
  );
}
