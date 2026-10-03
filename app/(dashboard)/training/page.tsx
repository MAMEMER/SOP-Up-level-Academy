import { TrainingView } from "../../../components/TrainingView.tsx";
import { requireUser } from "../../../lib/auth.ts";
import { workBranchFor } from "../../../lib/delivery-tasks-server.ts";
import { resolveEmployeeByEmail } from "../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../lib/workflow-records.ts";

// คู่มือแก้แยกต่อสาขาได้ (/admin/manual-config) — พนักงานเห็นคู่มือของสาขาที่เข้ากะวันนี้
export default async function TrainingPage() {
  const user = await requireUser();
  const branch = await workBranchFor(resolveEmployeeByEmail(user.email), formatWorkDate());
  return <TrainingView branch={branch} />;
}
