import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { employeeDirectory } from "../../../../lib/employee-directory.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { EvidenceImageInput } from "../../../../components/EvidenceImageInput.tsx";
import {
  deleteStockCheckRecord,
  fetchStockCheckRecords,
  saveStockCheckRecord,
  stockCheckResultOptions,
  stockCountTypeOptions,
  stockCheckRecordsForDate,
  STOREHUB_STOCKTAKE_URL,
  type StockCheckRecord
} from "../../../../lib/stock-check-records.ts";

type PageProps = {
  searchParams?: Promise<{ date?: string; status?: string }>;
};

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function back(workDate: string, status: string) {
  redirect(`/admin/stock-check?date=${workDate}&status=${status}`);
}

async function saveAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const workDate = stringValue(formData, "workDate") || formatWorkDate();
  if (user.role !== "admin" || user.isImpersonating) back(workDate, "denied");

  const employeeName = stringValue(formData, "employeeName");
  if (!employeeName) back(workDate, "missing_staff");

  try {
    await saveStockCheckRecord({
      workDate,
      employeeName,
      countType: stringValue(formData, "countType") === "monthly" ? "monthly" : "weekly",
      category: stringValue(formData, "category"),
      result: stringValue(formData, "result") as StockCheckRecord["result"],
      slowCount: formData.get("slowCount") === "on",
      note: stringValue(formData, "note"),
      evidence: stringValue(formData, "evidence"),
      recordedBy: user.actualEmail
    });
  } catch {
    back(workDate, "error");
  }

  revalidatePath("/admin/stock-check");
  revalidatePath("/admin/performance-score");
  back(workDate, "saved");
}

async function deleteAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const workDate = stringValue(formData, "workDate") || formatWorkDate();
  if (user.role !== "admin" || user.isImpersonating) back(workDate, "denied");

  try {
    await deleteStockCheckRecord(stringValue(formData, "id"));
  } catch {
    back(workDate, "error");
  }

  revalidatePath("/admin/stock-check");
  revalidatePath("/admin/performance-score");
  back(workDate, "removed");
}

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกแล้ว — คะแนน Stock อัปเดตทันที" },
  removed: { tone: "success", text: "ลบรายการแล้ว" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์แก้ไข (ต้องเป็นแอดมิน และไม่ได้อยู่ในโหมดดูแทนพนักงาน)" },
  missing_staff: { tone: "warning", text: "ต้องเลือกพนักงานที่รับผิดชอบ" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ" }
};

const resultLabel = Object.fromEntries(stockCheckResultOptions.map((option) => [option.value, option.label]));
const resultTone: Record<string, string> = {
  matched: "score-badge-green",
  resolved: "score-badge-green",
  real_loss: "score-badge-red",
  fraud_review: "score-badge-red",
  not_counted: "score-badge-red"
};

export default async function AdminStockCheckPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const params = searchParams ? await searchParams : {};
  const workDate = isDateValue(params.date) ? params.date! : formatWorkDate();
  const status = params.status ? statusMessages[params.status] : undefined;

  const all = await fetchStockCheckRecords();
  const today = stockCheckRecordsForDate(all, workDate);
  const recent = all.filter((record) => record.workDate !== workDate).slice(-12).reverse();
  const staff = employeeDirectory.map((entry) => entry.displayName);

  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">STOCK KPI</p>
          <h2>ลงคะแนน Stock</h2>
          <p>
            เปิด <a href={STOREHUB_STOCKTAKE_URL} target="_blank" rel="noreferrer">StoreHub Stock Take</a> เทียบยอด
            แล้วบันทึกผลของวันนั้นที่นี่ — ระบุคนที่รับผิดชอบ ผลว่าตรงหรือไม่ และแนบรูปแคปหน้าจอไว้เป็นหลักฐาน
            คะแนนหมวด Stock ของคนนั้นจะถูกหักตามผลที่บันทึกทันที
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            วันที่นับ
            <input type="date" name="date" defaultValue={workDate} />
          </label>
          <button type="submit">ดู</button>
        </form>
      </section>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <article className="performance-input-panel">
        <div>
          <p className="eyebrow">บันทึกผลการนับ</p>
          <h3>เพิ่มรายการของวันที่ {workDate}</h3>
        </div>
        <form action={saveAction} className="performance-input-form">
          <input type="hidden" name="workDate" value={workDate} />
          <label>
            พนักงานที่รับผิดชอบ
            <select name="employeeName" defaultValue={staff[0]}>
              {staff.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            รอบการนับ
            <select name="countType" defaultValue="weekly">
              {stockCountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            หมวดที่นับ
            <input name="category" placeholder="เช่น Sleeve, Pokémon single, น้ำ/ขนม" />
          </label>
          <label>
            ผลการเทียบกับ StoreHub
            <select name="result" defaultValue="matched">
              {stockCheckResultOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>
              ))}
            </select>
          </label>
          <label className="staff-form__toggle">
            <input type="checkbox" name="slowCount" />
            นับช้าเกินกรอบ 4 ชม. หลังเปิดร้าน (หัก 2)
          </label>
          <label className="wide">
            หมายเหตุ — ผิดตรงไหน / เพราะอะไร
            <input name="note" placeholder="เช่น Sleeve ขาด 3 ชิ้น หาสาเหตุไม่เจอ" />
          </label>
          <label className="wide">
            รูปแคปหน้าจอ StoreHub
            <EvidenceImageInput name="evidence" />
          </label>
          <button type="submit">บันทึกผลการนับ</button>
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
                  <strong>{record.employeeName} · {record.category}</strong>
                  <small>
                    {stockCountTypeOptions.find((option) => option.value === record.countType)?.label}
                    {record.slowCount ? " · นับช้า" : ""}
                    {record.note ? ` · ${record.note}` : ""}
                  </small>
                  {record.evidence ? (
                    <small><a href={record.evidence} target="_blank" rel="noreferrer">ดูหลักฐาน</a></small>
                  ) : (
                    <small>ไม่ได้แนบหลักฐาน</small>
                  )}
                </div>
                <span className={`score-badge ${resultTone[record.result] || ""}`}>{resultLabel[record.result]}</span>
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
            ยังไม่ได้บันทึกผลการนับของวันนี้ — วันที่ไม่มีรายการจะไม่ถูกหักคะแนน Stock
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
                <strong>{record.workDate} · {record.employeeName} · {record.category}</strong>
                <small>{resultLabel[record.result]}{record.note ? ` · ${record.note}` : ""}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
