import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../../lib/employee-directory.ts";
import {
  assignedWorkRecordById,
  readPerformanceDailyStore,
  updateAssignedWorkRecordSubmission
} from "../../../../lib/performance-service-records.ts";
import type { AssignedWork } from "../../../../lib/performance-score.ts";

function assignedStatus(value: string): AssignedWork["status"] {
  if (value === "early_quality" || value === "on_time" || value === "needs_revision" || value === "late_one_day" || value === "not_finished") return value;
  return "on_time";
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function canAccessAssignedWork(recordEmployeeName: string, user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.role === "admin") return true;
  const employeeCode = employeeCodeForEmail(user.email);
  return Boolean(employeeCode && (recordEmployeeName === employeeCode || recordEmployeeName === "ทีม บางแค"));
}

async function submitAssignedWorkAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const recordId = stringValue(formData, "recordId");
  const store = readPerformanceDailyStore();
  const record = assignedWorkRecordById(store.assignedWorkRecords, recordId);
  if (!record || !canAccessAssignedWork(record.employeeName, user)) notFound();

  updateAssignedWorkRecordSubmission(recordId, {
    status: assignedStatus(stringValue(formData, "assignedStatus")),
    note: stringValue(formData, "assignedNote"),
    evidence: stringValue(formData, "assignedEvidence")
  });

  revalidatePath("/");
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect("/");
}

export default async function AssignedWorkSubmitPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const user = await requireUser();
  const store = readPerformanceDailyStore();
  const record = assignedWorkRecordById(store.assignedWorkRecords, decodeURIComponent(recordId));
  if (!record || !canAccessAssignedWork(record.employeeName, user)) notFound();

  return (
    <main className="page">
      <Link href="/" className="back-link">กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">Assigned work</p>
          <h2>{record.title}</h2>
          <p>{record.employeeName} · {record.workDate}</p>
        </div>
      </section>

      <section className="performance-manual-input-grid">
        <article className="performance-input-panel">
          <div>
            <p className="eyebrow">Submit work</p>
            <h3>ส่งงานและหลักฐาน</h3>
          </div>
          <form action={submitAssignedWorkAction} className="performance-input-form">
            <input type="hidden" name="recordId" value={record.id} />
            <label>
              สถานะงาน
              <select name="assignedStatus" defaultValue={record.status}>
                <option value="early_quality">เสร็จก่อนกำหนด พร้อมคุณภาพ</option>
                <option value="on_time">เสร็จตรงเวลา</option>
                <option value="needs_revision">เสร็จแล้ว แต่ต้องแก้ไข</option>
                <option value="late_one_day">ช้ากว่ากำหนดไม่เกิน 1 วัน</option>
                <option value="not_finished">ยังไม่เสร็จ / เกินกำหนด</option>
              </select>
            </label>
            <label className="wide">
              รายละเอียดหลังทำงาน
              <textarea
                name="assignedNote"
                defaultValue={record.note}
                placeholder="สรุปสิ่งที่ทำ เช่น แพ็กเสื้อแล้ว ส่งรอบ 14:30 แจ้งลูกค้าแล้ว"
                rows={4}
              />
            </label>
            <label className="wide">
              หลักฐาน
              <textarea
                name="assignedEvidence"
                defaultValue={record.evidence || ""}
                placeholder="วางลิงก์รูป / สลิป / เลข Tracking / หมายเลขพัสดุ"
                rows={4}
              />
            </label>
            <button type="submit">ส่งงาน</button>
          </form>
        </article>

        <article className="performance-input-panel">
          <div>
            <p className="eyebrow">Current record</p>
            <h3>ข้อมูลล่าสุด</h3>
          </div>
          <div className="performance-daily-records">
            <strong>{record.title}</strong>
            <span>สถานะ: {record.status}</span>
            <span>รายละเอียด: {record.note || "-"}</span>
            <span>หลักฐาน: {record.evidence || "-"}</span>
            {record.submittedAt ? <span>ส่งล่าสุด: {record.submittedAt}</span> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
