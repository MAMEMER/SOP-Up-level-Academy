import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { DEFAULT_BOARD, sanitizeBoard, type BoardEvent } from "./activity-board.ts";
import {
  ourEventsByDate,
  sanitizeEvent,
  type CompetitorEvent,
  type CompetitorMeta,
  type OurDay
} from "./competitor-events.ts";
import { devFixturesOn } from "./dev-fixtures.ts";

export const COMPETITOR_EVENTS = "competitor_events";
// ตารางกิจกรรมสองสาขา — collection/doc เดียวกับ app/api/activity-board/route.ts
const BOARD_COLLECTION = "sop_activity_board";
const BOARD_DOC = "weekly";

export type CompetitorEventsData = {
  meta: CompetitorMeta | null;
  events: CompetitorEvent[];
  /** วัน → งานของร้านเรา (เฉพาะวันที่มีงานคู่แข่ง) */
  ours: Record<string, OurDay>;
};

function withOurs(meta: CompetitorMeta | null, events: CompetitorEvent[], board: BoardEvent[]): CompetitorEventsData {
  const dates = events.flatMap((e) => e.dates);
  return { meta, events, ours: ourEventsByDate(board, dates) };
}

export async function loadCompetitorEvents(): Promise<CompetitorEventsData> {
  if (devFixturesOn()) {
    const { fixtureCompetitorEvents } = await import("./dev-fixtures.ts");
    const { meta, raw } = fixtureCompetitorEvents();
    return withOurs(meta, raw.map((r, i) => sanitizeEvent(`fx${i}`, r)).filter((e): e is CompetitorEvent => !!e), DEFAULT_BOARD);
  }
  if (!hasAdminCredentials()) return { meta: null, events: [], ours: {} };
  const db = adminDb();
  const [snap, boardSnap] = await Promise.all([
    db.collection(COMPETITOR_EVENTS).get(),
    db.collection(BOARD_COLLECTION).doc(BOARD_DOC).get()
  ]);
  let meta: CompetitorMeta | null = null;
  const events: CompetitorEvent[] = [];
  for (const doc of snap.docs) {
    if (doc.id === "_meta") {
      const m = doc.data() as Partial<CompetitorMeta>;
      meta = { updatedAt: String(m.updatedAt ?? ""), count: Number(m.count) || 0, windowDays: Number(m.windowDays) || 0 };
      continue;
    }
    const e = sanitizeEvent(doc.id, doc.data());
    if (e) events.push(e);
  }
  const board = boardSnap.exists ? (sanitizeBoard((boardSnap.data() as { events?: unknown }).events) ?? []) : DEFAULT_BOARD;
  return withOurs(meta, events, board);
}
