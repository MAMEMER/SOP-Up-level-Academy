import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { displayNameFor, employeeDirectory } from "../../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { EvidenceImageInput } from "../../../../components/EvidenceImageInput.tsx";
import {
  deleteChecklistAuditRecord,
  fetchChecklistAuditRecords,
  saveChecklistAuditRecord
} from "../../../../lib/checklist-audit-store.ts";
import {
  checklistAuditRecordsForDate,
  checklistAuditTypeOptions,
  type ChecklistAuditType
} from "../../../../lib/checklist-audit-records.ts";

type PageProps = {
  searchParams?: Promise<{ date?: string; status?: string }>;
};

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function auditType(value: string): ChecklistAuditType {
  return value === "missing_important" ? "missing_important" : "false_record";
}

function back(workDate: string, status: string) {
  redirect(`/admin/checklist-audit?date=${workDate}&status=${status}`);
}

async function saveAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const workDate = stringValue(formData, "workDate") || formatWorkDate();
  if (user.role !== "admin" || user.isImpersonating) back(workDate, "denied");

  const employeeName = stringValue(formData, "employeeName");
  if (!employeeName) back(workDate, "missing_staff");

  const note = stringValue(formData, "note");
  // a -10 event follows someone into their salary — it has to say what was checked
  if (!note) back(workDate, "missing_note");

  try {
    await saveChecklistAuditRecord({
      workDate,
      employeeName,
      type: auditType(stringValue(formData, "type")),
      count: Number(stringValue(formData, "count") || "1"),
      note,
      evidence: stringValue(formData, "evidence"),
      recordedBy: user.actualEmail
    });
  } catch {
    back(workDate, "error");
  }

  revalidatePath("/admin/checklist-audit");
  revalidatePath("/admin/performance-score");
  back(workDate, "saved");
}

async function deleteAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const workDate = stringValue(formData, "workDate") || formatWorkDate();
  if (user.role !== "admin" || user.isImpersonating) back(workDate, "denied");

  try {
    await deleteChecklistAuditRecord(stringValue(formData, "id"));
  } catch {
    back(workDate, "error");
  }

  revalidatePath("/admin/checklist-audit");
  revalidatePath("/admin/performance-score");
  back(workDate, "removed");
}

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกแล้ว — คะแนน Checklist อัปเดตทันที" },
  removed: { tone: "success", text: "ลบรายการแล้ว — คะแนนที่หักไปคืนให้ทันที" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์แก้ไข (ต้องมีสิทธิ์จัดการ และไม่ได้อยู่ในโหมดดูแทนพนักงาน)" },
  missing_staff: { tone: "warning", text: "ต้องเลือกพนักงานที่ส่ง checklist วันนั้น" },
  missing_note: { tone: "warning", text: "ต้องเขียนว่าตรวจข้อไหน และไม่ตรงยังไง" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ" }
};

const typeLabel = Object.fromEntries(checklistAuditTypeOptions.map((option) => [option.value, option.label]));

export default async function AdminChecklistAuditPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const params = searchParams ? await searchParams : {};
  const workDate = isDateValue(params.date) ? params.date! : formatWorkDate();
  const status = params.status ? statusMessages[params.status] : undefined;

  const all = await fetchChecklistAuditRecords();
  const today = checklistAuditRecordsForDate(all, workDate);
  const recent = all.filter((record) => record.workDate !== workDate).slice(-12).reverse();
  // value = staff code (what the KPI matches on), label = the name shown everywhere else
  const staff = employeeDirectory.map((entry) => ({ code: entry.code, label: entry.displayName }));

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">CHECKLIST KPI</p>
          <h2>สุ่มตรวจ Checklist</h2>
          <p>
            เปิด <Link href="/checklist">checklist ของวันนั้น</Link> แล้วไปดูของจริงหน้าร้าน
            ถ้าติ๊กว่าทำแล้วแต่ไม่ได้ทำ ให้บันทึกที่นี่ — หัก 10 คะแนนพร้อมธง coach
            ส่วนการขาดส่ง checklist ทั้งวันระบบหักให้เองอยู่แล้ว ไม่ต้องบันทึกซ้ำ
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            วันที่ถูกตรวจ
            <input type="date" name="date" defaultValue={workDate} />
          </label>
          <button type="submit">ดู</button>
        </form>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <article className="performance-input-panel">
        <div>
          <p className="eyebrow">บันทึกผลสุ่มตรวจ</p>
          <h3>เพิ่มรายการของวันที่ {workDate}</h3>
        </div>
        <form action={saveAction} className="performance-input-form">
          <input type="hidden" name="workDate" value={workDate} />
          <label>
            พนักงานที่ส่ง checklist
            <select name="employeeName" defaultValue={staff[0]?.code}>
              {staff.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
          <label>
            สิ่งที่เจอ
            <select name="type" defaultValue="false_record">
              {checklistAuditTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>
              ))}
            </select>
          </label>
          <label>
            จำนวนครั้ง
            <input name="count" type="number" min="1" defaultValue="1" />
          </label>
          <label className="wide">
            ตรวจข้อไหน ไม่ตรงยังไง
            <input name="note" placeholder="เช่น ติ๊กว่าเช็ดตู้โชว์แล้ว แต่ฝุ่นยังเต็ม" />
          </label>
          <label className="wide">
            รูปหลักฐาน
            <EvidenceImageInput name="evidence" />
          </label>
          <button type="submit">บันทึกผลสุ่มตรวจ</button>
        </form>
      </article>

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">วันที่ {workDate}</p>
          <h3>รายการที่บันทึกไว้ ({today.length})</h3>
        </div>
        {today.length ? (
          <div className="stock-check-list">
            {today.map((record) => (
              <div key={record.id} className="stock-check-row">
                <div>
                  <strong>{displayNameFor(record.employeeName)} · x {record.count}</strong>
                  <small>{record.note}</small>
                  {record.evidence ? (
                    <small><a href={record.evidence} target="_blank" rel="noreferrer">ดูหลักฐาน</a></small>
                  ) : (
                    <small>ไม่ได้แนบหลักฐาน</small>
                  )}
                </div>
                <span className="score-badge score-badge-red">{typeLabel[record.type]}</span>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={record.id} />
                  <input type="hidden" name="workDate" value={workDate} />
                  <button type="submit" className="staff-form__delete">ลบ</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="owner-ops__empty">
            ยังไม่มีผลสุ่มตรวจของวันนี้ — วันที่ไม่มีรายการถือว่า checklist ตรงตามที่ส่ง
          </p>
        )}
      </section>

      {recent.length ? (
        <section className="owner-ops__panel">
          <div className="section-heading">
            <p className="eyebrow">ล่าสุด</p>
            <h3>รายการก่อนหน้า</h3>
          </div>
          <ul className="owner-ops__list">
            {recent.map((record) => (
              <li key={record.id}>
                <strong>{record.workDate} · {displayNameFor(record.employeeName)} · x {record.count}</strong>
                <small>{typeLabel[record.type]}{record.note ? ` · ${record.note}` : ""}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
