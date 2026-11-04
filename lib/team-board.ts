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
  column: BoardColumn;
  deleted?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  doneAt?: string | null;
};

export type CardDraft = Pick<BoardCard, "title" | "note" | "owner" | "due">;

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
  return { ok: true, value: { title, note, owner, due } };
}

/** Cards shown on the board: not deleted; done cards only for the last `doneDays` days. */
export function visibleCards(cards: BoardCard[], nowIso: string, doneDays = 7): BoardCard[] {
  const cutoff = new Date(new Date(nowIso).getTime() - doneDays * 864e5).toISOString();
  return cards.filter((c) => !c.deleted && (c.column !== "done" || (c.doneAt || c.updatedAt) >= cutoff));
}

export type PersonLoad = { key: string; todo: number; doing: number; late: number; level: "free" | "mid" | "full" };

/** Open = ต้องทำ + กำลังทำ. 0–2 ว่าง · 3–5 พอดี · 6+ เต็มมือ. */
export function personLoad(cards: BoardCard[], memberKeys: readonly string[], today: string): PersonLoad[] {
  return memberKeys.map((key) => {
    const mine = cards.filter((c) => !c.deleted && c.owner === key && c.column !== "done");
    const open = mine.length;
    return {
      key,
      todo: mine.filter((c) => c.column === "todo").length,
      doing: mine.filter((c) => c.column === "doing").length,
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
