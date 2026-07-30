import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ReorderAlert, type AssignReorderResult } from "../../../../components/ReorderAlert.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { displayNameFor, employeeDirectory } from "../../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import {
  assignedWorkRecordsForDate,
  reorderAssignedWorkId,
  saveReorderAssignedWorkRecord
} from "../../../../lib/performance-service-records.ts";
import { fetchPerformanceDailyStore } from "../../../../lib/performance-daily-store.ts";
import {
  DEFAULT_REORDER_THRESHOLD_THB,
  buildReorderDetail,
  buildReorderTitle,
  parseSupplyNeedsCsv,
  summariseReorder
} from "../../../../lib/supply-needs-reorder.ts";

const BRANCH = "bangkae";

// Server action: re-parses the pasted supply-needs text (never trust the client's number),
// re-checks the ฿1,000 threshold, then writes ONE KPI-scored assigned record per selected
// staff. Skips anyone who already has today's reorder task so re-running never double-counts
// or wipes a submission. Admin-gated (requireUser + role check), matching INVARIANT #5.
async function assignReorderAction(payload: {
  csvText: string;
  workDate: string;
  staffCodes: string[];
  force: boolean;
}): Promise<AssignReorderResult> {
  "use server";
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, message: "ต้องเป็นแอดมินเท่านั้น" };

  const workDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.workDate) ? payload.workDate : formatWorkDate();
  const codes = Array.from(new Set((payload.staffCodes || []).filter(Boolean)));
  if (codes.length === 0) return { ok: false, message: "ยังไม่ได้เลือกพนักงาน" };

  const summary = summariseReorder(parseSupplyNeedsCsv(payload.csvText || ""));
  if (summary.itemCount === 0) return { ok: false, message: "ไม่พบรายการสั่งซื้อในข้อมูลที่วาง" };
  if (!summary.reached && !payload.force) {
    return {
      ok: false,
      message: `ยอด ฿${summary.totalCost.toLocaleString()} ยังไม่ถึงเกณฑ์ ฿${summary.threshold.toLocaleString()}`
    };
  }

  const title = buildReorderTitle(summary);
  const note = buildReorderDetail(summary);

  // Skip staff who already have today's reorder task (deterministic id) to avoid duplicates.
  const store = await fetchPerformanceDailyStore();
  const existingIds = new Set(assignedWorkRecordsForDate(store.assignedWorkRecords, workDate).map((r) => r.id));

  let created = 0;
  let skipped = 0;
  const recordedAt = new Date().toISOString();
  for (const code of codes) {
    if (existingIds.has(reorderAssignedWorkId(workDate, code))) {
      skipped += 1;
      continue;
    }
    await saveReorderAssignedWorkRecord({ workDate, employeeName: code, title, note, recordedAt });
    created += 1;
  }

  revalidatePath("/");
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");

  const names = codes.map(displayNameFor).join(", ");
  const skipNote = skipped ? ` (ข้าม ${skipped} คนที่มีงานนี้อยู่แล้ววันนี้)` : "";
  if (created === 0) {
    return { ok: true, message: `พนักงานที่เลือกมีงานสั่งซื้อของวันนี้อยู่แล้วทั้งหมด${skipNote}` };
  }
  return {
    ok: true,
    message: `มอบหมายงานสั่งซื้อ (ยอด ฿${summary.totalCost.toLocaleString()}) ให้ ${names} แล้ว — ขึ้นบนหน้า "วันนี้ของฉัน" และนับเป็น KPI${skipNote}`
  };
}

export default async function AdminReorderAlertPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const staff = employeeDirectory
    .filter((entry) => entry.branch === BRANCH)
    .map((entry) => ({ code: entry.code, displayName: entry.displayName, employmentType: entry.employmentType }));

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← กลับ Admin Hub</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Supply Needs · Reorder alert</p>
          <h2>แจ้งเตือนสั่งซื้อสินค้า</h2>
          <p>
            เมื่อยอดต้นทุนของรายการที่ต้องเติมสต็อกใน StoreHub ถึง ฿{DEFAULT_REORDER_THRESHOLD_THB.toLocaleString()} →
            มอบหมายให้พนักงานตามกะสั่งซื้อ เป็นงาน KPI ที่มีผลกับคะแนน
          </p>
        </div>
      </section>
      <ReorderAlert
        branch={BRANCH}
        staff={staff}
        defaultDate={formatWorkDate()}
        assignReorderAction={assignReorderAction}
      />
    </main>
  );
}
