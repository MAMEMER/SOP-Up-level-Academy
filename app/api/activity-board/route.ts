import { NextResponse } from "next/server";
import { actor, badRequest, canWriteNow, db, forbidden, readOnly } from "../../../lib/api-firestore.ts";
import { isOwner } from "../../../lib/owner.ts";
import { listStaff } from "../../../lib/staff-store.ts";
import { defaultShiftStart, isWorkingAssignment, shiftEndTime, type ShiftAssignment } from "../../../lib/shift-schedule.ts";
import {
  BOARD_BRANCHES,
  BRANCH_START,
  DEFAULT_BOARD,
  SPECIAL_DAYS,
  isIsoDate,
  mondayOf,
  sanitizeBoard,
  weekDates,
  type BoardBranch,
  type BoardEvent,
  type DayStaff
} from "../../../lib/activity-board.ts";

// ตารางกิจกรรมสองสาขาของเจ้าของ (/admin/activities). อ่าน/เขียนได้เฉพาะ owner —
// แม่แบบกิจกรรมเก็บ doc เดียว, ส่วนคนเข้ากะอ่านจาก schedule_shifts ของสัปดาห์ที่ขอ.

export const dynamic = "force-dynamic";

const BOARD_COLLECTION = "sop_activity_board";
const BOARD_DOC = "weekly";
const SHIFTS = "schedule_shifts";
// ตารางที่เผยแพร่แล้ว — uplevelguild.com (/api/events-calendar) อ่าน doc นี้ไปทำปฏิทินหน้าเว็บ.
// แยกจากแม่แบบที่แก้อยู่ เพื่อให้เจ้าของจัดตารางเล่นๆ ได้โดยไม่ขึ้นเว็บจนกว่าจะกด "อัพเดทเว็บ".
const PUBLIC_COLLECTION = "public_weekly_schedule";
const PUBLIC_DOC = "current";

type PublishedInfo = { publishedAt: string; publishedBy: string; sourceUpdatedAt: string };

async function readPublished(): Promise<PublishedInfo | null> {
  const snap = await db().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).get();
  if (!snap.exists) return null;
  const d = snap.data() as Partial<PublishedInfo>;
  return { publishedAt: d.publishedAt || "", publishedBy: d.publishedBy || "", sourceUpdatedAt: d.sourceUpdatedAt || "" };
}

type BoardDoc = { events: BoardEvent[]; updatedAt: string; updatedBy: string };

async function readBoard(): Promise<BoardDoc> {
  const snap = await db().collection(BOARD_COLLECTION).doc(BOARD_DOC).get();
  if (!snap.exists) return { events: DEFAULT_BOARD, updatedAt: "", updatedBy: "" };
  const data = snap.data() as Partial<BoardDoc>;
  return { events: sanitizeBoard(data.events) ?? [], updatedAt: data.updatedAt || "", updatedBy: data.updatedBy || "" };
}

async function readWeekStaff(dates: string[]): Promise<Record<string, Partial<DayStaff>>> {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const [staff, ...snaps] = await Promise.all([
    listStaff(),
    ...BOARD_BRANCHES.flatMap((b) =>
      months.map((m) => db().collection(SHIFTS).where("branch", "==", b.key).where("month", "==", m).get())
    )
  ]);
  const names = new Map(staff.filter((s) => s.code).map((s) => [s.code, s.displayName || s.name || s.code]));
  const wanted = new Set(dates);
  // วันที่ "มีแผน" ของสาขานั้น (มีช่องใดช่องหนึ่ง แม้เป็นวันหยุด) — ไม่มีแผนเลย = ไม่รู้ ไม่เตือน
  const out: Record<string, Partial<DayStaff>> = {};
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const d = doc.data() as { branch?: string; workDate?: string; staffCode?: string; assignment?: ShiftAssignment; startTime?: string };
      const branch = d.branch as BoardBranch;
      if (!d.workDate || !wanted.has(d.workDate) || !d.staffCode || !d.assignment) continue;
      if (branch !== "bangkae" && branch !== "senafest") continue;
      const day = (out[d.workDate] ||= {});
      const list = (day[branch] ||= []);
      if (!isWorkingAssignment(d.assignment)) continue;
      const start = d.startTime || defaultShiftStart(d.assignment, branch);
      list.push({ code: d.staffCode, name: names.get(d.staffCode) || d.staffCode, shift: d.assignment, start, end: shiftEndTime(start) });
    }
  }
  for (const day of Object.values(out))
    for (const list of Object.values(day)) list?.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  return out;
}

export async function GET(request: Request) {
  const { user } = await actor();
  if (!isOwner(user.email)) return forbidden();
  const week = new URL(request.url).searchParams.get("week") || "";
  if (week && !isIsoDate(week)) return badRequest("bad_week");
  try {
    const [board, pub] = await Promise.all([readBoard(), readPublished().catch(() => null)]);
    const published = pub ? { publishedAt: pub.publishedAt, matches: pub.sourceUpdatedAt === board.updatedAt } : null;
    if (!week) return NextResponse.json({ ...board, published });
    const monday = mondayOf(week);
    const staffByDate = await readWeekStaff(weekDates(monday));
    return NextResponse.json({ ...board, monday, staffByDate, published });
  } catch (error) {
    return NextResponse.json({ error: "read_failed", detail: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isOwner(user.email)) return forbidden();
  const body = (await request.json().catch(() => null)) as { events?: unknown; baseUpdatedAt?: string } | null;
  const events = sanitizeBoard(body?.events);
  if (!events) return badRequest("bad_events");
  try {
    const ref = db().collection(BOARD_COLLECTION).doc(BOARD_DOC);
    const result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? String((snap.data() as BoardDoc).updatedAt || "") : "";
      // อีกเครื่องเพิ่งบันทึกทับไป → ไม่เขียนทับเงียบๆ ส่งของล่าสุดกลับให้หน้าเว็บ
      if ((body?.baseUpdatedAt || "") !== current) return { conflict: true as const };
      const doc: BoardDoc = { events, updatedAt: new Date().toISOString(), updatedBy: user.actualEmail };
      tx.set(ref, doc);
      return { conflict: false as const, doc };
    });
    if (result.conflict) return NextResponse.json({ error: "conflict", ...(await readBoard()) }, { status: 409 });
    return NextResponse.json(result.doc);
  } catch (error) {
    return NextResponse.json({ error: "write_failed", detail: String(error) }, { status: 500 });
  }
}

// กด "อัพเดทเว็บ" — คัดลอกตารางที่บันทึกแล้ว + งานพิเศษ ไปเป็นตารางสาธารณะ
export async function POST() {
  const { user } = await actor();
  if (!canWriteNow(user)) return readOnly();
  if (!isOwner(user.email)) return forbidden();
  try {
    const board = await readBoard();
    if (!board.updatedAt) return badRequest("board_not_saved");
    const publishedAt = new Date().toISOString();
    await db().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).set({
      events: board.events,
      specials: SPECIAL_DAYS,
      branchStart: BRANCH_START,
      sourceUpdatedAt: board.updatedAt,
      publishedAt,
      publishedBy: user.actualEmail
    });
    return NextResponse.json({ publishedAt, matches: true });
  } catch (error) {
    return NextResponse.json({ error: "publish_failed", detail: String(error) }, { status: 500 });
  }
}
