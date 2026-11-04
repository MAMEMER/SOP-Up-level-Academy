// บอร์ดทีม — a plain kanban for the four leaders: what each person is doing now and what
// has been handed to whom. Deliberately separate from Masterplan tasks (no codes, no missions).

export const BOARD_COLUMNS = ["todo", "doing", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export const COLUMN_LABEL: Record<BoardColumn, string> = { todo: "ต้องทำ", doing: "กำลังทำ", done: "เสร็จแล้ว" };

export type BoardCard = {
  id: string;
  title: string;
  note: string;
  owner: string; // member key, "" = ยังไม่มีคนรับ
  due: string; // YYYY-MM-DD or ""
  start?: string; // YYYY-MM-DD planned pick-up day, "" = whenever
  column: BoardColumn;
  deleted?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  doneAt?: string | null;
};

export type CardDraft = Pick<BoardCard, "title" | "note" | "owner" | "due"> & { start: string };

export const isColumn = (v: unknown): v is BoardColumn => typeof v === "string" && (BOARD_COLUMNS as readonly string[]).includes(v);

export function validateCardDraft(input: unknown, memberKeys: readonly string[]): { ok: true; value: CardDraft } | { ok: false; error: string } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(raw.title).replace(/\s+/g, " ");
  if (!title) return { ok: false, error: "ใส่ชื่องานก่อน" };
  if (title.length > 140) return { ok: false, error: "ชื่องานยาวเกิน 140 ตัวอักษร" };
  const note = str(raw.note);
  if (note.length > 500) return { ok: false, error: "รายละเอียดยาวเกิน 500 ตัวอักษร" };
  const owner = str(raw.owner);
  if (owner && !memberKeys.includes(owner)) return { ok: false, error: "ไม่รู้จักคนที่มอบหมาย" };
  const due = str(raw.due);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  const start = str(raw.start);
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, error: "วันเริ่มไม่ถูกต้อง" };
  if (start && due && start > due) return { ok: false, error: "วันเริ่มต้องไม่เกินวันส่ง" };
  return { ok: true, value: { title, note, owner, due, start } };
}

/** Cards shown on the board: not deleted; done cards only for the last `doneDays` days. */
export function visibleCards(cards: BoardCard[], nowIso: string, doneDays = 7): BoardCard[] {
  const cutoff = new Date(new Date(nowIso).getTime() - doneDays * 864e5).toISOString();
  return cards.filter((c) => !c.deleted && (c.column !== "done" || (c.doneAt || c.updatedAt) >= cutoff));
}

export type PersonLoad = { key: string; planned: number; todo: number; doing: number; late: number; level: "free" | "mid" | "full" };

/** Load = ต้องทำ (pick-up day reached) + กำลังทำ; planned work is counted apart. 0–2 ว่าง · 3–5 พอดี · 6+ เต็มมือ. */
export function personLoad(cards: BoardCard[], memberKeys: readonly string[], today: string): PersonLoad[] {
  return memberKeys.map((key) => {
    const mine = cards.filter((c) => !c.deleted && c.owner === key && c.column !== "done");
    const planned = mine.filter((c) => isPlanned(c, today)).length;
    const todo = mine.filter((c) => c.column === "todo").length - planned;
    const doing = mine.filter((c) => c.column === "doing").length;
    const open = todo + doing;
    return {
      key,
      planned,
      todo,
      doing,
      late: mine.filter((c) => c.due && c.due < today).length,
      level: open <= 2 ? "free" : open <= 5 ? "mid" : "full"
    };
  });
}

export function sortCards(a: BoardCard, b: BoardCard): number {
  if (a.column === "done" && b.column === "done") return (b.doneAt || b.updatedAt).localeCompare(a.doneAt || a.updatedAt);
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/** A ต้องทำ card whose pick-up day is still ahead sits in "วางแผนไว้" until that day. */
export function isPlanned(card: BoardCard, today: string): boolean {
  return card.column === "todo" && Boolean(card.start) && (card.start as string) > today;
}

/** Shift a YYYY-MM-DD date by whole days (UTC math, no timezone drift). */
export function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type AgendaItem = { kind: "start" | "due"; card: BoardCard };

/** Upcoming start / due days for open cards, from `today` for `days` days (overdue dues land on today). */
export function agenda(cards: BoardCard[], today: string, days = 28): { date: string; items: AgendaItem[] }[] {
  const end = shiftDate(today, days - 1);
  const map = new Map<string, AgendaItem[]>();
  const push = (date: string, item: AgendaItem) => map.set(date, [...(map.get(date) ?? []), item]);
  for (const card of cards) {
    if (card.deleted || card.column === "done") continue;
    if (card.start && card.start >= today && card.start <= end && card.start !== card.due && card.column === "todo") push(card.start, { kind: "start", card });
    if (card.due && card.due <= end) push(card.due < today ? today : card.due, { kind: "due", card });
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }));
}

/** A queued LINE nudge (GB → owner). Written by the board, sent and stamped by the line-ops bot. */
export type BoardPing = {
  id: string;
  cardId: string;
  title: string;
  due: string;
  to: string; // member key
  from: string; // member key
  message: string;
  createdAt: string;
  sentAt: string | null;
};
