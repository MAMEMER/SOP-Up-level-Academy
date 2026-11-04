"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  CalendarDays,
  Check,
  KanbanSquare,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { MASTERPLAN_MEMBERS, memberName } from "../../lib/masterplan-access.ts";
import type { BoardEvent } from "../../lib/activity-board.ts";
import { TeamCalendar } from "./TeamCalendar.tsx";
import { mpApi, useLocalDraft } from "../../lib/masterplan-client.ts";
import {
  COLUMN_LABEL,
  isPlanned,
  personLoad,
  shiftDate,
  sortCards,
  visibleCards,
  type BoardCard,
  type BoardColumn,
  type CardDraft,
} from "../../lib/team-board.ts";

// บอร์ดทีม — three columns (ต้องทำ / กำลังทำ / เสร็จแล้ว), a load strip per person, and a
// quick-add row that is always open. Polls every 20 s so teammates' moves show up.

const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const LEVEL_TEXT = {
  free: "รับเพิ่มได้",
  mid: "พอดีมือ",
  full: "เต็มมือ",
} as const;
const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);
const emptyDraft = (owner: string): CardDraft => ({
  title: "",
  note: "",
  owner,
  due: "",
  start: "",
});
const LEAD_DAYS = [1, 3, 7];
type Lane = "planned" | BoardColumn;
const LANES: Lane[] = ["planned", "todo", "doing", "done"];
const LANE_LABEL: Record<Lane, string> = {
  planned: "วางแผนไว้",
  ...COLUMN_LABEL,
};

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]}`;
}
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5,
  );
}

type Toast = { message: string; undo?: () => Promise<void> };

export function TeamBoard({
  initialCards,
  shopEvents,
  me,
  today,
}: {
  initialCards: BoardCard[];
  shopEvents: BoardEvent[];
  me: string;
  today: string;
}) {
  const [cards, setCards] = useState<BoardCard[]>(initialCards);
  const [filter, setFilter] = useLocalDraft<string>("tb-filter", "");
  const [view, setView] = useLocalDraft<"board" | "calendar">(
    "tb-view",
    "board",
  );
  const [draft, setDraft, clearDraft] = useLocalDraft<CardDraft>(
    "tb-new-card",
    emptyDraft(me),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const res = await mpApi<{ cards: BoardCard[] }>("board", "GET");
    if (res.ok) setCards(res.data.cards);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 20_000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  function showToast(next: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function act(
    body: Record<string, unknown>,
    method = "PATCH",
  ): Promise<boolean> {
    setError(null);
    const res = await mpApi("board", method, body);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    await reload();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim() || busy) return;
    setBusy(true);
    const ok = await act({ draft }, "POST");
    setBusy(false);
    if (ok) {
      const owner = draft.owner;
      clearDraft();
      setDraft(emptyDraft(owner));
      showToast({
        message: owner
          ? `เพิ่มงานให้${memberName(owner)}แล้ว`
          : "เพิ่มงานแล้ว (ยังไม่มีคนรับ)",
      });
    }
  }

  async function move(card: BoardCard, column: BoardColumn) {
    const from = card.column;
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, column } : c)),
    );
    const ok = await act({ id: card.id, action: "move", column });
    if (ok)
      showToast({
        message: `ย้ายไป "${COLUMN_LABEL[column]}"`,
        undo: async () =>
          void (await act({ id: card.id, action: "move", column: from })),
      });
  }

  async function ping(card: BoardCard, message: string): Promise<boolean> {
    setError(null);
    const res = await mpApi("board/ping", "POST", { id: card.id, message });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setPinging(null);
    showToast({
      message: `ส่งให้ GB ทัก${memberName(card.owner)}ใน LINE แล้ว`,
    });
    return true;
  }

  async function remove(card: BoardCard) {
    setEditing(null);
    const ok = await act({ id: card.id, action: "delete" });
    if (ok)
      showToast({
        message: "ลบงานแล้ว",
        undo: async () => void (await act({ id: card.id, action: "restore" })),
      });
  }

  const shown = visibleCards(cards, new Date().toISOString()).filter(
    (c) => !filter || (filter === "none" ? !c.owner : c.owner === filter),
  );
  const loads = personLoad(cards, memberKeys, today);
  const unowned = cards.filter(
    (c) => !c.deleted && !c.owner && c.column !== "done",
  ).length;
  const laneOf = (c: BoardCard): Lane =>
    isPlanned(c, today) ? "planned" : c.column;
  const lightest = [...loads].sort(
    (a, b) => a.todo + a.doing - (b.todo + b.doing) || a.late - b.late,
  )[0];

  return (
    <div className="tb">
      <section className="tb-people" aria-label="งานในมือแต่ละคน">
        {loads.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`tb-person is-${p.level}${filter === p.key ? " is-active" : ""}`}
            aria-pressed={filter === p.key}
            onClick={() => setFilter(filter === p.key ? "" : p.key)}
          >
            <span className="tb-person__name">
              {memberName(p.key)}
              {p.key === me ? <small> (ฉัน)</small> : null}
            </span>
            <span className="tb-person__nums">
              <b>{p.doing}</b> กำลังทำ · <b>{p.todo}</b> ต้องทำ
            </span>
            {p.planned ? (
              <span className="tb-person__plan">วางแผนไว้ {p.planned}</span>
            ) : null}
            <span className="tb-person__foot">
              <span className="tb-level">{LEVEL_TEXT[p.level]}</span>
              {p.late ? (
                <span className="tb-late">เลยกำหนด {p.late}</span>
              ) : null}
            </span>
          </button>
        ))}
        {unowned ? (
          <button
            type="button"
            className={`tb-person is-pool${filter === "none" ? " is-active" : ""}`}
            aria-pressed={filter === "none"}
            onClick={() => setFilter(filter === "none" ? "" : "none")}
          >
            <span className="tb-person__name">ยังไม่มีคนรับ</span>
            <span className="tb-person__nums">
              <b>{unowned}</b> งาน
            </span>
          </button>
        ) : null}
      </section>

      <form className="tb-add" onSubmit={add}>
        <label className="tb-add__title">
          <span className="sr-only">งานอะไร</span>
          <input
            id="tb-new-title"
            type="text"
            value={draft.title}
            maxLength={140}
            placeholder="งานอะไร เช่น ถ่ายรูปสินค้าใหม่ลงเพจ"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <div className="tb-add__row">
          <OwnerChips
            value={draft.owner}
            me={me}
            onChange={(owner) => setDraft({ ...draft, owner })}
          />
        </div>
        <DatePlan
          value={draft}
          idPrefix="tb-new"
          today={today}
          onChange={(d) => setDraft({ ...draft, ...d })}
        />
        <div className="tb-add__foot">
          {lightest ? (
            <p className="tb-hint">
              ตอนนี้ <b>{memberName(lightest.key)}</b> ถืองานน้อยสุด (
              {lightest.todo + lightest.doing} งาน)
            </p>
          ) : null}
          <button
            type="submit"
            className="mp-btn mp-btn--primary"
            disabled={busy || !draft.title.trim()}
          >
            <Plus size={16} aria-hidden="true" /> เพิ่มงาน
          </button>
        </div>
      </form>

      {error ? <p className="mp-error">{error}</p> : null}
      {filter ? (
        <p className="tb-filter">
          ดูเฉพาะ{" "}
          {filter === "none" ? "งานที่ยังไม่มีคนรับ" : memberName(filter)}
          <button
            type="button"
            className="mp-btn mp-btn--quiet"
            onClick={() => setFilter("")}
          >
            <X size={14} aria-hidden="true" /> ดูทุกคน
          </button>
        </p>
      ) : null}

      <div className="tb-views" role="tablist" aria-label="มุมมอง">
        <button
          type="button"
          role="tab"
          aria-selected={view === "board"}
          className="tb-view"
          onClick={() => setView("board")}
        >
          <KanbanSquare size={16} aria-hidden="true" /> บอร์ด
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "calendar"}
          className="tb-view"
          onClick={() => setView("calendar")}
        >
          <CalendarDays size={16} aria-hidden="true" /> ปฏิทิน
        </button>
      </div>

      {view === "calendar" ? (
        <TeamCalendar
          cards={shown}
          shopEvents={shopEvents}
          today={today}
          me={me}
          onPick={(date, field) => {
            setDraft({ ...draft, [field]: date, ...(field === "start" && draft.due && draft.due < date ? { due: "" } : {}) });
            const input = document.getElementById("tb-new-title");
            input?.scrollIntoView({ behavior: "smooth", block: "center" });
            input?.focus({ preventScroll: true });
          }}
        />
      ) : null}

      {view === "board" ? (
        <div className="tb-cols">
          {LANES.map((column) => {
            const items = shown
              .filter((c) => laneOf(c) === column)
              .sort(sortCards);
            if (column === "planned" && items.length === 0) return null;
            return (
              <section
                key={column}
                className={`tb-col is-${column}`}
                aria-label={LANE_LABEL[column]}
              >
                <h2 className="tb-col__head">
                  {LANE_LABEL[column]}{" "}
                  <span className="mp-count">{items.length}</span>
                  {column === "done" ? <small>7 วันล่าสุด</small> : null}
                </h2>
                {items.length === 0 ? (
                  <p className="tb-empty">
                    {column === "doing"
                      ? "ยังไม่มีใครกดเริ่มทำ"
                      : column === "done"
                        ? "ยังไม่มีงานเสร็จสัปดาห์นี้"
                        : "ไม่มีงานค้าง"}
                  </p>
                ) : null}
                <ul className="tb-list">
                  {items.map((card) =>
                    editing === card.id ? (
                      <li key={card.id} className="tb-card is-editing">
                        <CardEditor
                          card={card}
                          me={me}
                          today={today}
                          onCancel={() => setEditing(null)}
                          onDelete={() => remove(card)}
                          onSave={async (d) =>
                            (await act({
                              id: card.id,
                              action: "update",
                              draft: d,
                            })) && setEditing(null)
                          }
                        />
                      </li>
                    ) : (
                      <li
                        key={card.id}
                        className={`tb-card${card.owner === me ? " is-mine" : ""}`}
                      >
                        <p className="tb-card__title">{card.title}</p>
                        {card.note ? (
                          <p className="tb-card__note">{card.note}</p>
                        ) : null}
                        <div className="tb-card__meta">
                          <span
                            className={`tb-owner${card.owner ? "" : " is-none"}`}
                          >
                            {card.owner
                              ? memberName(card.owner)
                              : "ยังไม่มีคนรับ"}
                          </span>
                          {card.start && card.column === "todo" ? (
                            <span
                              className={`tb-start${card.start <= today ? " is-now" : ""}`}
                            >
                              {card.start <= today
                                ? "ถึงวันหยิบแล้ว"
                                : `เริ่ม ${shortDate(card.start)}`}
                            </span>
                          ) : null}
                          <DueTag card={card} today={today} />
                          {card.owner && card.createdBy !== card.owner ? (
                            <span className="tb-by">
                              มอบโดย {memberName(card.createdBy)}
                            </span>
                          ) : null}
                        </div>
                        <div className="tb-card__actions">
                          {column === "todo" || column === "planned" ? (
                            <button
                              type="button"
                              className="tb-act is-go"
                              onClick={() => move(card, "doing")}
                            >
                              <Play size={15} aria-hidden="true" />{" "}
                              {column === "planned" ? "เริ่มเลย" : "เริ่มทำ"}
                            </button>
                          ) : null}
                          {column === "doing" ? (
                            <>
                              <button
                                type="button"
                                className="tb-act is-go"
                                onClick={() => move(card, "done")}
                              >
                                <Check size={15} aria-hidden="true" /> เสร็จ
                              </button>
                              <button
                                type="button"
                                className="tb-act"
                                onClick={() => move(card, "todo")}
                                aria-label="ย้ายกลับไปต้องทำ"
                              >
                                <ArrowLeft size={15} aria-hidden="true" />
                              </button>
                            </>
                          ) : null}
                          {column === "done" ? (
                            <button
                              type="button"
                              className="tb-act"
                              onClick={() => move(card, "doing")}
                            >
                              <RotateCcw size={15} aria-hidden="true" /> ทำต่อ
                            </button>
                          ) : null}
                          {card.owner &&
                          card.owner !== me &&
                          column !== "done" ? (
                            <button
                              type="button"
                              className="tb-act tb-act--ping"
                              aria-expanded={pinging === card.id}
                              onClick={() =>
                                setPinging(pinging === card.id ? null : card.id)
                              }
                              aria-label={`เตือน${memberName(card.owner)}เรื่อง ${card.title}`}
                            >
                              <BellRing size={15} aria-hidden="true" /> เตือน
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="tb-act tb-act--edit"
                            onClick={() => setEditing(card.id)}
                            aria-label={`แก้งาน ${card.title}`}
                          >
                            <Pencil size={15} aria-hidden="true" /> แก้
                          </button>
                        </div>
                        {pinging === card.id ? (
                          <PingForm
                            card={card}
                            onSend={(m) => ping(card, m)}
                            onCancel={() => setPinging(null)}
                          />
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {toast ? (
        <div className="tb-toast" role="status">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={async () => {
                const undo = toast.undo;
                setToast(null);
                await undo?.();
              }}
            >
              เลิกทำ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OwnerChips({
  value,
  me,
  onChange,
}: {
  value: string;
  me: string;
  onChange: (owner: string) => void;
}) {
  return (
    <div className="tb-chips" role="group" aria-label="ใครทำ">
      {MASTERPLAN_MEMBERS.map((m) => (
        <button
          key={m.key}
          type="button"
          className="tb-chip"
          aria-pressed={value === m.key}
          onClick={() => onChange(m.key)}
        >
          {m.name}
          {m.key === me ? " (ฉัน)" : ""}
        </button>
      ))}
      <button
        type="button"
        className="tb-chip"
        aria-pressed={value === ""}
        onClick={() => onChange("")}
      >
        ยังไม่ระบุ
      </button>
    </div>
  );
}

function DueTag({ card, today }: { card: BoardCard; today: string }) {
  if (!card.due || card.column === "done") return null;
  const days = daysBetween(today, card.due);
  if (days < 0) return <span className="tb-due is-late">เลย {-days} วัน</span>;
  if (days === 0) return <span className="tb-due is-late">วันนี้</span>;
  if (days <= 2)
    return (
      <span className="tb-due is-soon">
        {days === 1 ? "พรุ่งนี้" : shortDate(card.due)}
      </span>
    );
  return <span className="tb-due">{shortDate(card.due)}</span>;
}

function CardEditor({
  card,
  me,
  today,
  onSave,
  onCancel,
  onDelete,
}: {
  card: BoardCard;
  me: string;
  today: string;
  onSave: (d: CardDraft) => Promise<unknown>;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState<CardDraft>({
    title: card.title,
    note: card.note,
    owner: card.owner,
    due: card.due,
    start: card.start ?? "",
  });
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="tb-edit"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        setSaving(true);
        await onSave(d);
        setSaving(false);
      }}
    >
      <input
        id={`tb-edit-title-${card.id}`}
        type="text"
        value={d.title}
        maxLength={140}
        onChange={(e) => setD({ ...d, title: e.target.value })}
        aria-label="ชื่องาน"
      />
      <textarea
        id={`tb-edit-note-${card.id}`}
        value={d.note}
        maxLength={500}
        rows={2}
        placeholder="รายละเอียด (ไม่ใส่ก็ได้)"
        onChange={(e) => setD({ ...d, note: e.target.value })}
        aria-label="รายละเอียด"
      />
      <OwnerChips
        value={d.owner}
        me={me}
        onChange={(owner) => setD({ ...d, owner })}
      />
      <DatePlan
        value={d}
        idPrefix={`tb-edit-${card.id}`}
        today={today}
        onChange={(x) => setD({ ...d, ...x })}
      />
      <div className="tb-edit__btns">
        <button
          type="submit"
          className="mp-btn mp-btn--primary"
          disabled={saving || !d.title.trim()}
        >
          บันทึก
        </button>
        <button
          type="button"
          className="mp-btn mp-btn--quiet"
          onClick={onCancel}
        >
          ยกเลิก
        </button>
        <button
          type="button"
          className="mp-btn mp-btn--quiet tb-del"
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" /> ลบ
        </button>
      </div>
    </form>
  );
}

/** ส่ง (deadline) + เริ่ม (pick-up day). "ใช้เวลา ~N วัน" counts back from the deadline. */
function DatePlan({
  value,
  idPrefix,
  today,
  onChange,
}: {
  value: Pick<CardDraft, "due" | "start">;
  idPrefix: string;
  today: string;
  onChange: (d: Pick<CardDraft, "due" | "start">) => void;
}) {
  const lead =
    value.due && value.start
      ? Math.round(
          (Date.parse(`${value.due}T00:00:00Z`) -
            Date.parse(`${value.start}T00:00:00Z`)) /
            864e5,
        )
      : null;
  return (
    <div className="tb-dates">
      <label className="tb-add__due">
        <span>ส่งภายใน</span>
        <input
          id={`${idPrefix}-due`}
          type="date"
          value={value.due}
          onChange={(e) => {
            const due = e.target.value;
            // keep the same lead time when the deadline moves
            const start =
              due && lead !== null
                ? maxDate(shiftDate(due, -lead), today)
                : value.start && due && value.start > due
                  ? ""
                  : value.start;
            onChange({ due, start });
          }}
        />
      </label>
      <div className="tb-lead" role="group" aria-label="ใช้เวลาประมาณ">
        <span>ใช้เวลา ~</span>
        {LEAD_DAYS.map((n) => (
          <button
            key={n}
            type="button"
            className="tb-chip tb-chip--sm"
            disabled={!value.due}
            aria-pressed={lead === n}
            onClick={() =>
              onChange({
                due: value.due,
                start: maxDate(shiftDate(value.due, -n), today),
              })
            }
          >
            {n === 7 ? "1 สัปดาห์" : `${n} วัน`}
          </button>
        ))}
      </div>
      <label className="tb-add__due">
        <span>เริ่มหยิบ</span>
        <input
          id={`${idPrefix}-start`}
          type="date"
          value={value.start}
          max={value.due || undefined}
          onChange={(e) => onChange({ due: value.due, start: e.target.value })}
        />
      </label>
      {value.start && value.start > today ? (
        <span className="tb-dates__note">
          ไปอยู่ "วางแผนไว้" แล้ว GB จะทักใน LINE วันที่{" "}
          {shortDate(value.start)}
        </span>
      ) : null}
    </div>
  );
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}


function PingForm({
  card,
  onSend,
  onCancel,
}: {
  card: BoardCard;
  onSend: (message: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [message, setMessage, clearMessage] = useLocalDraft<string>(
    `tb-ping-${card.id}`,
    "",
  );
  const [sending, setSending] = useState(false);
  return (
    <form
      className="tb-ping"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        const ok = await onSend(message);
        setSending(false);
        if (ok) clearMessage();
      }}
    >
      <p className="tb-ping__lead">
        GB จะทัก <b>{memberName(card.owner)}</b> ใน LINE ให้อย่าลืมงานนี้
      </p>
      <textarea
        id={`tb-ping-msg-${card.id}`}
        value={message}
        maxLength={300}
        rows={2}
        placeholder="ข้อความเพิ่ม (ไม่ใส่ก็ได้) เช่น ขอภายในบ่ายนี้นะ"
        onChange={(e) => setMessage(e.target.value)}
        aria-label="ข้อความเพิ่ม"
      />
      <div className="tb-edit__btns">
        <button
          type="submit"
          className="mp-btn mp-btn--primary"
          disabled={sending}
        >
          <BellRing size={15} aria-hidden="true" /> ส่งเตือน
        </button>
        <button
          type="button"
          className="mp-btn mp-btn--quiet"
          onClick={onCancel}
        >
          ยกเลิก
        </button>
      </div>
      <p className="tb-ping__note">ส่งช่วง 08:30–22:00 · นอกเวลาจะส่งตอนเช้า</p>
    </form>
  );
}
