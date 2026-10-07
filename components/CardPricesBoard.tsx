"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, ExternalLink, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { SubmitStatus, type SubmitState } from "./SubmitStatus.tsx";
import {
  GAMES,
  VERDICTS,
  baht,
  confidence,
  feedbackError,
  gameLabel,
  searchRows,
  sortRows,
  summarize,
  type CardWatch,
  type PriceFeedback,
  type RefRow,
  type SortKey,
  type Verdict
} from "../lib/card-prices.ts";
import type { CardPricesData } from "../lib/card-prices-server.ts";

type Me = { code: string; admin: boolean; owner: boolean; readOnly: boolean };
type StaffOption = { code: string; name: string };

const PAGE = 40;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "sellers", label: "คนขายเยอะสุด" },
  { key: "price", label: "แพงสุด" },
  { key: "recent", label: "โพสต์ล่าสุด" },
  { key: "flagged", label: "มีคนทักท้วง" }
];

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; at?: string; error?: string }> {
  try {
    const res = await fetch("/api/card-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.detail || json.error || `HTTP ${res.status}` };
    return { ok: true, at: json.at };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function dayLabel(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

function tagLine(row: RefRow): string {
  return [
    gameLabel(row.game),
    row.number ? `${row.set} #${row.number}` : "",
    row.lang,
    row.grade === "RAW" ? "" : row.grade
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CardPricesBoard({ data, me, staff }: { data: CardPricesData; me: Me; staff: StaffOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [sort, setSort] = useState<SortKey>("sellers");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const feedbackByRow = useMemo(() => {
    const map = new Map<string, PriceFeedback[]>();
    for (const f of data.feedback) map.set(f.rowId, [...(map.get(f.rowId) ?? []), f]);
    return map;
  }, [data.feedback]);
  const flagged = useMemo(() => new Map([...feedbackByRow].map(([id, list]) => [id, list.length])), [feedbackByRow]);
  const overrides = useMemo(() => new Map(data.overrides.map((o) => [o.id, o])), [data.overrides]);

  const rows = useMemo(
    () => sortRows(searchRows(data.rows, query, game), sort, flagged),
    [data.rows, query, game, sort, flagged]
  );

  return (
    <>
      <ScoutPanel watches={data.watches} me={me} staff={staff} onChange={() => router.refresh()} />

      <section className="cp-tools" aria-label="ค้นหาราคา">
        <label className="cp-search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            inputMode="search"
            placeholder="ชื่อการ์ด อังกฤษ/ไทย หรือเลขการ์ด เช่น 201/165"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
          />
        </label>
        <nav className="stock-loss-tabs cp-tabs" aria-label="เกม">
          {GAMES.map((g) => (
            <button
              key={g.key}
              type="button"
              className={g.key === game ? "is-active" : undefined}
              aria-pressed={g.key === game}
              onClick={() => {
                setGame(g.key);
                setShown(PAGE);
              }}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <label className="cp-sort">
          เรียงตาม
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="cp-count">{rows.length.toLocaleString("th-TH")} การ์ด</p>
      </section>

      {rows.length === 0 ? (
        <p className="detail-hint">ยังไม่มีราคาการ์ดนี้ — ตั้งสเกาต์ไว้ได้ เจอโพสต์ขายเมื่อไหร่บอททักไลน์บอก</p>
      ) : (
        <ul className="cp-list">
          {rows.slice(0, shown).map((row) => (
            <CardRow
              key={row.id}
              row={row}
              me={me}
              staff={staff}
              feedback={feedbackByRow.get(row.id) ?? []}
              override={overrides.get(row.id)}
              open={open === row.id}
              onToggle={() => setOpen(open === row.id ? null : row.id)}
              onChange={() => router.refresh()}
            />
          ))}
        </ul>
      )}
      {rows.length > shown ? (
        <button type="button" className="cp-more" onClick={() => setShown(shown + PAGE)}>
          แสดงเพิ่มอีก {Math.min(PAGE, rows.length - shown)} ใบ
        </button>
      ) : null}
    </>
  );
}

function CardRow({
  row,
  me,
  staff,
  feedback,
  override,
  open,
  onToggle,
  onChange
}: {
  row: RefRow;
  me: Me;
  staff: StaffOption[];
  feedback: PriceFeedback[];
  override?: { price: number; byName: string; note: string };
  open: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const conf = confidence(row.n);
  const sum = summarize(feedback);
  return (
    <li className={`cp-row${open ? " is-open" : ""}`}>
      <button type="button" className="cp-row-head" onClick={onToggle} aria-expanded={open}>
        <span className="cp-thumb">
          {row.img ? <img src={row.img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{gameLabel(row.game).slice(0, 1)}</span>}
        </span>
        <span className="cp-name">
          <strong>{row.name}</strong>
          {row.aka && row.aka !== row.name ? <small>{row.aka}</small> : null}
          <small>{tagLine(row)}</small>
          {sum.open ? <small className="cp-flag">ทักท้วง {sum.open} เรื่อง{sum.suggestMedian ? ` · เสนอ ~${baht(sum.suggestMedian)}` : ""}</small> : null}
        </span>
        <span className="cp-price">
          {override ? (
            <>
              <strong>{baht(override.price)}</strong>
              <small className="cp-chip is-good">ราคาร้าน</small>
              <small>ตลาด {baht(row.median)}</small>
            </>
          ) : row.median ? (
            <>
              <strong>{baht(row.median)}</strong>
              <small className={`cp-chip is-${conf.tone}`}>
                {conf.label} · {row.n} คนขาย
              </small>
            </>
          ) : (
            <small>ยังไม่มีคนตั้งขาย</small>
          )}
          {row.trend !== null && Math.abs(row.trend) >= 0.05 ? (
            <small className={row.trend > 0 ? "cp-up" : "cp-down"}>
              {row.trend > 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
              {Math.round(Math.abs(row.trend) * 100)}%
            </small>
          ) : null}
        </span>
      </button>
      {open ? <CardDetail row={row} me={me} staff={staff} feedback={feedback} override={override} onChange={onChange} /> : null}
    </li>
  );
}

function CardDetail({
  row,
  me,
  staff,
  feedback,
  override,
  onChange
}: {
  row: RefRow;
  me: Me;
  staff: StaffOption[];
  feedback: PriceFeedback[];
  override?: { price: number; byName: string; note: string };
  onChange: () => void;
}) {
  return (
    <div className="cp-detail">
      <dl className="cp-facts">
        <div>
          <dt>คนส่วนใหญ่ตั้งขาย</dt>
          <dd>{row.n >= 2 ? `${baht(row.p25)} – ${baht(row.p75)}` : baht(row.median)}</dd>
        </div>
        <div>
          <dt>ต่ำสุด – สูงสุด</dt>
          <dd>{row.low ? `${baht(row.low)} – ${baht(row.high)}` : "–"}</dd>
        </div>
        <div>
          <dt>รับซื้อ</dt>
          <dd>{row.buy ? `${baht(row.buy)} (${row.nbuy} โพสต์)` : "–"}</dd>
        </div>
        {row.usd ? (
          <div>
            <dt>TCGplayer</dt>
            <dd>${row.usd.toFixed(2)}</dd>
          </div>
        ) : null}
      </dl>
      {override ? (
        <p className="cp-note">
          ราคาร้านยืนยันโดย {override.byName}: {baht(override.price)}
          {override.note ? ` — ${override.note}` : ""}
        </p>
      ) : null}
      {!row.printing ? (
        <p className="cp-note">ราคานี้รวมทุกใบที่ชื่อนี้ (โพสต์ไม่ได้บอกเลขการ์ด) — ถ้ามีหลายแบบ ราคาอาจปนกัน</p>
      ) : null}

      <h4>โพสต์ล่าสุด</h4>
      <ul className="cp-samples">
        {row.samples.map((s, i) => (
          <li key={i}>
            <span>
              {s.kind === "buy" ? "รับซื้อ " : ""}
              <strong>{baht(s.price)}</strong>
            </span>
            <span className="cp-sample-who">
              {s.seller || "ไม่ทราบชื่อ"} · {dayLabel(s.at)}
            </span>
            {s.link ? (
              <a href={s.link} target="_blank" rel="noreferrer" aria-label="เปิดโพสต์">
                <ExternalLink size={16} aria-hidden /> โพสต์
              </a>
            ) : (
              <span className="cp-sample-who">{s.group}</span>
            )}
          </li>
        ))}
      </ul>

      {feedback.length ? (
        <>
          <h4>ทักท้วงที่ยังเปิดอยู่</h4>
          <ul className="cp-feedback">
            {feedback.map((f) => (
              <FeedbackItem key={f.id} f={f} me={me} onChange={onChange} />
            ))}
          </ul>
        </>
      ) : null}

      {me.readOnly ? null : <FeedbackForm row={row} onChange={onChange} />}
      {me.owner && !me.readOnly ? <OverrideForm row={row} current={override?.price} onChange={onChange} /> : null}
      {me.readOnly ? null : <WatchForm row={row} me={me} staff={staff} onChange={onChange} />}
    </div>
  );
}

function FeedbackItem({ f, me, onChange }: { f: PriceFeedback; me: Me; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <li>
      <span>
        <strong>{VERDICTS[f.verdict]}</strong>
        {f.suggest ? ` · เสนอ ${baht(f.suggest)}` : ""}
        {f.note ? ` — ${f.note}` : ""}
      </span>
      <small>{f.byName}</small>
      {me.admin && !me.readOnly ? (
        <button
          type="button"
          className="cp-link-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await post({ action: "closeFeedback", id: f.id });
            onChange();
          }}
        >
          ดูแล้ว ปิดเรื่อง
        </button>
      ) : null}
    </li>
  );
}

function FeedbackForm({ row, onChange }: { row: RefRow; onChange: () => void }) {
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [suggest, setSuggest] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<SubmitState>("not_sent");
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <form
      className="cp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const err = feedbackError(verdict, suggest);
        if (err) return setError(err);
        setError("");
        setState("sending");
        const res = await post({ action: "feedback", rowId: row.id, key: row.key, name: row.name, verdict, suggest, note });
        if (!res.ok) {
          setState("failed");
          return setError(res.error || "");
        }
        setState("sent");
        setSentAt(res.at ?? null);
        setVerdict("");
        setSuggest("");
        setNote("");
        onChange();
      }}
    >
      <h4>ราคานี้เป็นยังไง</h4>
      <div className="cp-verdicts" role="radiogroup" aria-label="ความเห็น">
        {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={verdict === v}
            className={verdict === v ? "is-active" : undefined}
            onClick={() => setVerdict(v)}
          >
            {VERDICTS[v]}
          </button>
        ))}
      </div>
      {verdict && verdict !== "ok" ? (
        <div className="cp-fields">
          <label>
            ราคาที่ควรเป็น (บาท){verdict === "wrong_card" ? " — ถ้ารู้" : ""}
            <input type="number" inputMode="numeric" min={1} value={suggest} onChange={(e) => setSuggest(e.target.value)} />
          </label>
          <label>
            เหตุผล / ใบที่ถูก
            <input type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ร้านเรารับซื้อ 300 ขาย 450" />
          </label>
        </div>
      ) : null}
      {error ? <p className="cp-error">{error}</p> : null}
      <div className="cp-actions">
        <button type="submit" className="primary-action" disabled={!verdict || state === "sending"}>
          ส่งความเห็น
        </button>
        <SubmitStatus state={state} sentAt={sentAt} compact />
      </div>
    </form>
  );
}

function OverrideForm({ row, current, onChange }: { row: RefRow; current?: number; onChange: () => void }) {
  const [price, setPrice] = useState(current ? String(current) : "");
  const [note, setNote] = useState("");
  const [state, setState] = useState<SubmitState>("not_sent");
  const [error, setError] = useState("");
  return (
    <form
      className="cp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const res = await post({ action: "override", rowId: row.id, key: row.key, name: row.name, price, note });
        setState(res.ok ? "sent" : "failed");
        setError(res.ok ? "" : res.error || "");
        if (res.ok) onChange();
      }}
    >
      <h4>ยืนยันราคาร้าน (เจ้าของ)</h4>
      <div className="cp-fields">
        <label>
          ราคาร้าน (บาท)
          <input type="number" inputMode="numeric" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          หมายเหตุ
          <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {error ? <p className="cp-error">{error}</p> : null}
      <div className="cp-actions">
        <button type="submit" className="soft-button" disabled={!price || state === "sending"}>
          ใช้ราคานี้
        </button>
        {current ? (
          <button
            type="button"
            className="cp-link-btn"
            onClick={async () => {
              await post({ action: "clearOverride", rowId: row.id });
              onChange();
            }}
          >
            เลิกใช้ราคาร้าน
          </button>
        ) : null}
        <SubmitStatus state={state} compact />
      </div>
    </form>
  );
}

function StaffSelect({ me, staff, value, onChange }: { me: Me; staff: StaffOption[]; value: string; onChange: (v: string) => void }) {
  if (!me.admin || !staff.length) return null;
  return (
    <label>
      ให้ใครจับตา
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {staff.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
            {s.code === me.code ? " (ฉัน)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function WatchForm({ row, me, staff, onChange }: { row: RefRow; me: Me; staff: StaffOption[]; onChange: () => void }) {
  const [who, setWho] = useState(me.code || staff[0]?.code || "");
  const [maxPrice, setMaxPrice] = useState("");
  const [state, setState] = useState<SubmitState>("not_sent");
  return (
    <form
      className="cp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const res = await post({ action: "watch", key: row.key, name: row.name, game: row.game, maxPrice, staffCode: who });
        setState(res.ok ? "sent" : "failed");
        if (res.ok) onChange();
      }}
    >
      <h4>
        <Eye size={16} aria-hidden /> สเกาต์ใบนี้
      </h4>
      <div className="cp-fields">
        <StaffSelect me={me} staff={staff} value={who} onChange={setWho} />
        <label>
          บอกเมื่อขายไม่เกิน (บาท) — เว้นว่าง = ทุกราคา
          <input type="number" inputMode="numeric" min={1} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </label>
      </div>
      <div className="cp-actions">
        <button type="submit" className="soft-button" disabled={state === "sending"}>
          เริ่มจับตา
        </button>
        <SubmitStatus state={state} compact />
      </div>
    </form>
  );
}

function ScoutPanel({ watches, me, staff, onChange }: { watches: CardWatch[]; me: Me; staff: StaffOption[]; onChange: () => void }) {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [who, setWho] = useState(me.code || staff[0]?.code || "");
  const [state, setState] = useState<SubmitState>("not_sent");
  const [error, setError] = useState("");
  const mine = me.admin ? watches : watches.filter((w) => w.staffCode === me.code);

  return (
    <section className="cp-scout" aria-label="สเกาต์การ์ด">
      <h3>
        <Eye size={18} aria-hidden /> สเกาต์การ์ด
      </h3>
      <p className="cp-sub">ใบที่ตั้งไว้ พอมีคนโพสต์ขายในกลุ่ม FB บอทจะทักไลน์คนที่จับตาทันที (เช็คทุกรอบที่อ่านกลุ่ม วันละ 5 รอบ)</p>
      {mine.length ? (
        <ul className="cp-watch-list">
          {mine.map((w) => (
            <li key={w.id}>
              <span className="cp-name">
                <strong>{w.name || w.query}</strong>
                <small>
                  {[w.game ? gameLabel(w.game) : "", w.maxPrice ? `ไม่เกิน ${baht(w.maxPrice)}` : "ทุกราคา", `${w.staffName} จับตา`]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                <small>
                  {w.hits ? `เจอแล้ว ${w.hits} ครั้ง` : "ยังไม่เจอ"}
                  {w.lastHit ? ` · ล่าสุด ${baht(w.lastHit.price)}` : ""}
                  {w.lastHit?.link ? (
                    <>
                      {" · "}
                      <a href={w.lastHit.link} target="_blank" rel="noreferrer">
                        เปิดโพสต์
                      </a>
                    </>
                  ) : null}
                </small>
              </span>
              {me.readOnly ? null : (
                <button
                  type="button"
                  className="cp-icon-btn"
                  aria-label={`เลิกจับตา ${w.name}`}
                  onClick={async () => {
                    await post({ action: "unwatch", id: w.id });
                    onChange();
                  }}
                >
                  <X size={18} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="detail-hint">ยังไม่มีการ์ดที่จับตาอยู่</p>
      )}
      {me.readOnly ? null : (
        <form
          className="cp-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!query.trim()) return setError("พิมพ์ชื่อการ์ดก่อน");
            setError("");
            setState("sending");
            const res = await post({ action: "watch", query, name: query, game, maxPrice, staffCode: who });
            setState(res.ok ? "sent" : "failed");
            if (!res.ok) return setError(res.error || "");
            setQuery("");
            setMaxPrice("");
            onChange();
          }}
        >
          <div className="cp-fields">
            <label>
              การ์ดที่จะจับตา (ชื่ออังกฤษ)
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="เช่น Charizard ex" />
            </label>
            <label>
              เกม
              <select value={game} onChange={(e) => setGame(e.target.value)}>
                {GAMES.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              บอกเมื่อขายไม่เกิน (บาท)
              <input type="number" inputMode="numeric" min={1} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="เว้นว่าง = ทุกราคา" />
            </label>
            <StaffSelect me={me} staff={staff} value={who} onChange={setWho} />
          </div>
          {error ? <p className="cp-error">{error}</p> : null}
          <div className="cp-actions">
            <button type="submit" className="primary-action" disabled={state === "sending"}>
              เพิ่มการ์ดที่จับตา
            </button>
            <SubmitStatus state={state} compact />
          </div>
          <p className="cp-sub">หรือค้นการ์ดด้านล่าง กดที่การ์ด แล้วกด "เริ่มจับตา" — จะได้ใบที่ตรงเป๊ะ</p>
        </form>
      )}
    </section>
  );
}
