import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { effectiveAssignedWorkDisplayStatus } from "../../../../lib/assigned-work-status.ts";
import {
  ASSIGNED_WORK_NOT_SUBMITTED_LABEL,
  ASSIGNED_WORK_STATUSES,
  ASSIGNED_WORK_STATUS_LABEL,
  type AssignedWorkStatus
} from "../../../../lib/assigned-work-status-labels.ts";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeCodeForEmail } from "../../../../lib/employee-directory.ts";
import {
  assignedWorkRecordById,
  updateAssignedWorkRecordSubmission
} from "../../../../lib/performance-service-records.ts";
import { fetchPerformanceDailyStore } from "../../../../lib/performance-daily-store.ts";
import { isTeamRecordName } from "../../../../lib/store-config.ts";

function assignedStatus(value: string): AssignedWorkStatus | undefined {
  return (ASSIGNED_WORK_STATUSES as readonly string[]).includes(value) ? (value as AssignedWorkStatus) : undefined;
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function imageEvidenceValues(formData: FormData) {
  return formData
    .getAll("assignedImages")
    .map((entry) => {
      if (typeof entry === "string") return "";
      return "name" in entry ? String(entry.name || "").trim() : "";
    })
    .filter(Boolean);
}

function canAccessAssignedWork(recordEmployeeName: string, user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.role === "admin") return true;
  const employeeCode = employeeCodeForEmail(user.email);
  return Boolean(employeeCode && (recordEmployeeName === employeeCode || isTeamRecordName(recordEmployeeName)));
}

async function submitAssignedWorkAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  // View-as is read-only (INVARIANTS §5): an owner previewing a staffer must not submit for them.
  if (user.isImpersonating) notFound();
  const recordId = stringValue(formData, "recordId");
  const store = await fetchPerformanceDailyStore();
  const record = assignedWorkRecordById(store.assignedWorkRecords, recordId);
  if (!record || !canAccessAssignedWork(record.employeeName, user)) notFound();

  await updateAssignedWorkRecordSubmission(recordId, {
    // Admin may explicitly pick a status (needs_revision / completed / back to pending_review)
    // in this same action; otherwise ANY submission (employee or admin) resets to
    // pending_review — see updateAssignedWorkRecords in performance-service-records.ts.
    status: user.role === "admin" ? assignedStatus(stringValue(formData, "assignedStatus")) : undefined,
    note: stringValue(formData, "assignedNote"),
    evidence: stringValue(formData, "assignedEvidence"),
    trackingNumber: stringValue(formData, "assignedTrackingNumber"),
    imageEvidence: imageEvidenceValues(formData)
  });

  revalidatePath("/");
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect("/");
}

export default async function AssignedWorkSubmitPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const user = await requireUser();
  const store = await fetchPerformanceDailyStore();
  const record = assignedWorkRecordById(store.assignedWorkRecords, decodeURIComponent(recordId));
  if (!record || !canAccessAssignedWork(record.employeeName, user)) notFound();
  // Visible identically to employees and admins — no role/deadline gate on the status itself.
  const displayStatus = effectiveAssignedWorkDisplayStatus(record);
  const statusLabel =
    displayStatus === "not_submitted" ? ASSIGNED_WORK_NOT_SUBMITTED_LABEL : ASSIGNED_WORK_STATUS_LABEL[displayStatus];

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
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
            {user.role === "admin" ? (
              <label>
                สถานะงาน
                <select name="assignedStatus" defaultValue={record.status}>
                  <option value="pending_review">{ASSIGNED_WORK_STATUS_LABEL.pending_review} (ส่งกลับไปรอตรวจใหม่)</option>
                  <option value="needs_revision">{ASSIGNED_WORK_STATUS_LABEL.needs_revision}</option>
                  <option value="completed">{ASSIGNED_WORK_STATUS_LABEL.completed}</option>
                </select>
              </label>
            ) : null}
            <label className="wide">
              รายละเอียดหลังทำงาน
              <textarea
                name="assignedNote"
                defaultValue={record.note}
                placeholder="สรุปสิ่งที่ทำ เช่น แพ็กเสื้อแล้ว ส่งรอบ 14:30 แจ้งลูกค้าแล้ว"
                rows={4}
              />
            </label>
            <label>
              เลข Tracking
              <input
                name="assignedTrackingNumber"
                defaultValue={record.trackingNumber || ""}
                placeholder="เช่น TH1234567890"
              />
            </label>
            <label>
              รูปหลักฐาน
              <input name="assignedImages" type="file" accept="image/*" multiple />
            </label>
            <label className="wide">
              หลักฐานเพิ่มเติม
              <textarea
                name="assignedEvidence"
                defaultValue={record.evidence || ""}
                placeholder="วางลิงก์รูป / สลิป / หมายเหตุอ้างอิงหลักฐาน"
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
            <span>สถานะ: {statusLabel}</span>
            <span>รายละเอียด: {record.note || "-"}</span>
            <span>เลข Tracking: {record.trackingNumber || "-"}</span>
            <span>รูปหลักฐาน: {record.imageEvidence?.length ? record.imageEvidence.join(", ") : "-"}</span>
            <span>หลักฐานเพิ่มเติม: {record.evidence || "-"}</span>
            {record.submittedAt ? <span>ส่งล่าสุด: {record.submittedAt}</span> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
