import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { TaskBoard } from "../../../../components/masterplan/TaskBoard.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { listTasks } from "../../../../lib/masterplan-store.ts";
import { bangkokDate } from "../../../../lib/masterplan.ts";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const member = await requireMasterplanMember();
  const tasks = await listTasks();
  return (
    <>
      <MpHead eyebrow="งาน" title="งานที่ต้องทำตามแผน" sub="หยิบงานที่จะทำ อัปเดตสถานะเมื่อคืบหน้า งานที่เลยกำหนดขึ้นสีแดง" />
      <TaskBoard tasks={tasks} me={member.key} today={bangkokDate()} />
    </>
  );
}
