import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { TeamBoard } from "../../../../components/masterplan/TeamBoard.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { listAll } from "../../../../lib/masterplan-store.ts";
import { bangkokDate } from "../../../../lib/masterplan.ts";
import type { BoardCard } from "../../../../lib/team-board.ts";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const member = await requireMasterplanMember();
  const cards = (await listAll<BoardCard>("mp_board")).filter((c) => !c.deleted);
  return (
    <>
      <MpHead eyebrow="ทีม" title="บอร์ดทีม" sub="ใครทำอะไรอยู่ มอบงานให้ใคร อัปเดตสั้นๆ ให้ทีมรู้" />
      <TeamBoard initialCards={cards} me={member.key} today={bangkokDate()} />
    </>
  );
}
