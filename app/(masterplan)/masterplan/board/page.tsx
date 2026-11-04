import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { TeamBoard } from "../../../../components/masterplan/TeamBoard.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { listAll } from "../../../../lib/masterplan-store.ts";
import { bangkokDate } from "../../../../lib/masterplan.ts";
import type { BoardCard } from "../../../../lib/team-board.ts";
import { DEFAULT_BOARD, sanitizeBoard, type BoardEvent } from "../../../../lib/activity-board.ts";
import { adminDb, hasAdminCredentials } from "../../../../lib/firebase-admin.ts";

// ตารางกิจกรรมกลาง (/admin/activities แม่แบบรายสัปดาห์) — โชว์ในปฏิทินบอร์ดให้รู้ว่าวันไหนร้านมีงาน.
async function shopEvents(): Promise<BoardEvent[]> {
  if (!hasAdminCredentials()) return DEFAULT_BOARD;
  try {
    const snap = await adminDb().collection("sop_activity_board").doc("weekly").get();
    if (!snap.exists) return DEFAULT_BOARD;
    return sanitizeBoard((snap.data() as { events?: unknown }).events) ?? [];
  } catch {
    return [];
  }
}

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const member = await requireMasterplanMember();
  const [cards, events] = await Promise.all([listAll<BoardCard>("mp_board"), shopEvents()]);
  return (
    <>
      <MpHead eyebrow="ทีม" title="บอร์ดทีม" sub="ใครทำอะไรอยู่ มอบงานให้ใคร อัปเดตสั้นๆ ให้ทีมรู้" />
      <TeamBoard initialCards={cards.filter((c) => !c.deleted)} shopEvents={events} me={member.key} today={bangkokDate()} />
    </>
  );
}
