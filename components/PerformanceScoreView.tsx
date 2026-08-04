import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchLateChecklistDays, fetchSubmittedChecklistDays } from "../lib/checklist-kpi.ts";
import {
  getPerformanceScoreRowsForRange,
  getPerformanceScoreRows,
  getPerformanceSummary,
  getPerformanceSourceDetail,
  performanceSourceStatuses,
  currentReviewPeriod,
  previousHalfMonthPeriod,
  type PerformanceReviewPeriod
} from "../lib/performance-score-data.ts";
import {
  assignedWorkRecordsForDate,
  customerServiceRecordsForDate,
  saveAssignedWorkRecords,
  saveCustomerServiceRecord
} from "../lib/performance-service-records.ts";
import { EvidenceImageInput } from "./EvidenceImageInput.tsx";
import { fetchAttendanceSource } from "../lib/planner-kpi.ts";
import { displayNameFor, employeeDirectory } from "../lib/employee-directory.ts";
import { fetchPerformanceDailyStore } from "../lib/performance-daily-store.ts";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string; inputStatus?: string }>;
};

type PerformanceScoreViewProps = PageProps & {
  basePath?: "/admin/performance-score" | "/performance-score";
  showAdminBackLink?: boolean;
  /** salary-deduction figures are owner-only (hidden from regular admins) */
  isOwner?: boolean;
};

const categoryLabels = {
  attendance: "เข้างาน",
  stock: "Stock",
  checklist: "Checklist",
  customerService: "บริการลูกค้า",
  assignedWork: "งานที่มอบหมาย"
};

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/**
 * Staff pickers follow the directory managed at /admin/staff.
 *
 * The option VALUE is the staff code, because that is what the scoring engine matches on
 * (`employees = employeeCodes`). Submitting the display name instead silently dropped the
 * record for anyone whose name differs from their code — it only appeared to work while
 * every code happened to equal its display name.
 *
 * Read per render, not once at module load: the directory is hydrated from Firestore by
 * requireUser(), so a module-level const froze whatever the roster was when the server
 * booted — renaming someone left the old name in these dropdowns until a redeploy.
 */
function staffOptions() {
  return employeeDirectory.map((entry) => ({ code: entry.code, label: entry.displayName }));
}

// Collapse records that share a groupId into one line so a task handed to several people
// (ticket S3JjyiwLxyHLpPn6uOyX) reads as "งานเดียวกัน → คนนั้นคนนี้" instead of N scattered
// rows. Ungrouped records (single-assignee / legacy team rows) each stay their own group.
type AssignedRecordForDisplay = { id: string; employeeName: string; title: string; status: string; groupId?: string };
function groupAssignedRecords<T extends AssignedRecordForDisplay>(records: T[]) {
  const groups: { key: string; groupId?: string; title: string; status: string; members: T[] }[] = [];
  const byGroupId = new Map<string, number>();
  records.forEach((record) => {
    if (record.groupId) {
      const idx = byGroupId.get(record.groupId);
      if (idx !== undefined) {
        groups[idx].members.push(record);
        return;
      }
      byGroupId.set(record.groupId, groups.length);
      groups.push({ key: record.groupId, groupId: record.groupId, title: record.title, status: record.status, members: [record] });
      return;
    }
    groups.push({ key: record.id, title: record.title, status: record.status, members: [record] });
  });
  return groups;
}

function resolvePeriod(params: { period?: string; startDate?: string; endDate?: string }): PerformanceReviewPeriod {
  if (isDateValue(params.startDate) && isDateValue(params.endDate)) {
    const startDate = params.startDate!;
    const endDate = params.endDate!;
    return {
      id: "custom",
      label: `${startDate} ถึง ${endDate}`,
      startDate: startDate <= endDate ? startDate : endDate,
      endDate: startDate <= endDate ? endDate : startDate
    };
  }
  if (params.period === "previous-half-month") return previousHalfMonthPeriod();
  // default = เดือนนี้ถึงวันนี้ (was a frozen 2026-07-01 → 2026-07-09 literal)
  return currentReviewPeriod();
}

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "import-ready") return "Import-ready";
  if (status === "manual") return "Manual";
  return status;
}

function sourceHref(sourceKey: string, period: PerformanceReviewPeriod, basePath: string) {
  return `${basePath}?startDate=${period.startDate}&endDate=${period.endDate}&source=${sourceKey}`;
}

function bangkokDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "2026";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function shiftBangkokDate(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function quickPeriodHref(basePath: string, startDate: string, endDate: string, source?: string) {
  const params = new URLSearchParams({ startDate, endDate });
  if (source) params.set("source", source);
  return `${basePath}?${params.toString()}`;
}

function quickPeriodLinks(basePath: string, source?: string) {
  const today = bangkokDateValue();
  return [
    { label: "วันนี้", href: quickPeriodHref(basePath, today, today, source) },
    { label: "7 วันล่าสุด", href: quickPeriodHref(basePath, shiftBangkokDate(today, -6), today, source) },
    { label: "เดือนนี้", href: quickPeriodHref(basePath, `${today.slice(0, 8)}01`, today, source) }
  ];
}

function safeRedirectTo(value: FormDataEntryValue | null) {
  const path = String(value || "/admin/performance-score");
  return path.startsWith("/admin/performance-score") || path.startsWith("/performance-score") ? path : "/admin/performance-score";
}

function withInputStatus(path: string, status: "service-saved" | "service-error") {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}inputStatus=${status}`;
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function serviceBucket(value: string) {
  return value === "event_response" ? "event_response" : "feedback";
}

function serviceSeverity(value: string) {
  if (value === "repeated" || value === "severe") return value;
  return "fixed_immediately";
}

function assignedStatus(value: string) {
  if (value === "early_quality" || value === "on_time" || value === "needs_revision" || value === "late_one_day" || value === "not_finished") return value;
  return "on_time";
}

async function saveComplaintServiceAction(formData: FormData) {
  "use server";
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));
  let inputStatus: "service-saved" | "service-error" = "service-saved";
  try {
    await saveCustomerServiceRecord({
      workDate: stringValue(formData, "serviceDate"),
      employeeName: stringValue(formData, "employeeName"),
      bucket: serviceBucket(stringValue(formData, "bucket")),
      severity: serviceSeverity(stringValue(formData, "severity")),
      count: Number(stringValue(formData, "serviceCount") || "1"),
      note: stringValue(formData, "serviceNote"),
      evidence: stringValue(formData, "serviceEvidence")
    });
  } catch {
    inputStatus = "service-error";
  }
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect(withInputStatus(redirectTo, inputStatus));
}

// Sentinel value emitted by the "ทั้งทีมบางแค (ทุกคน)" checkbox in the assigned-work form.
// When present, the task is handed to every staff member in the picker — but as one record
// per person (each scored independently), not the legacy single-row team fan-out.
const ASSIGN_ALL_TEAM = "__ALL_TEAM__";

function resolveAssignEmployees(formData: FormData): string[] {
  const selected = formData.getAll("employeeName").map((value) => String(value).trim()).filter(Boolean);
  if (selected.includes(ASSIGN_ALL_TEAM)) {
    return staffOptions().map((option) => option.code);
  }
  return [...new Set(selected)];
}

async function saveAssignedWorkAction(formData: FormData) {
  "use server";
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));
  const title = stringValue(formData, "assignedTitle");
  const employeeNames = resolveAssignEmployees(formData);
  // Same task → one record per selected person, sharing a groupId (ticket S3JjyiwLxyHLpPn6uOyX).
  if (title && employeeNames.length > 0) {
    await saveAssignedWorkRecords({
      workDate: stringValue(formData, "assignedDate"),
      employeeNames,
      title,
      status: assignedStatus(stringValue(formData, "assignedStatus")),
      note: stringValue(formData, "assignedNote"),
      evidence: stringValue(formData, "assignedEvidence")
    });
  }
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect(redirectTo);
}

export async function PerformanceScoreView({ searchParams, basePath = "/admin/performance-score", showAdminBackLink = false, isOwner = false }: PerformanceScoreViewProps) {
  const params = searchParams ? await searchParams : {};
  const activePeriod = resolvePeriod(params);
  const dailyStore = await fetchPerformanceDailyStore();
  const attendance = await fetchAttendanceSource("bangkae");
  const submittedChecklistDays = await fetchSubmittedChecklistDays("bangkae", activePeriod.startDate, activePeriod.endDate);
  const lateChecklistDays = await fetchLateChecklistDays("bangkae", activePeriod.startDate, activePeriod.endDate);
  const rows =
    activePeriod.id === "custom"
      ? getPerformanceScoreRowsForRange(activePeriod, dailyStore, attendance, submittedChecklistDays, lateChecklistDays)
      : getPerformanceScoreRows(activePeriod.id, dailyStore, attendance, submittedChecklistDays, lateChecklistDays);
  const summary = getPerformanceSummary(rows);
  const activeSourceDetail = getPerformanceSourceDetail(params.source || "");
  const redirectTo = `${basePath}?startDate=${activePeriod.startDate}&endDate=${activePeriod.endDate}${params.source ? `&source=${params.source}` : ""}`;
  const inputStatus = params.inputStatus;
  const entryDate = activePeriod.endDate;
  const periodShortcuts = quickPeriodLinks(basePath, params.source);
  const serviceRecordsForDay = customerServiceRecordsForDate(dailyStore.serviceRecords, entryDate);
  const assignedRecordsForDay = assignedWorkRecordsForDate(dailyStore.assignedWorkRecords, entryDate);

  return (
    <main className="page performance-score-page">
      <section className="board-hero performance-score-hero">
        <div>
          <p className="eyebrow">Admin KPI</p>
          <h2>Performance Score</h2>
          <p>เช็คคะแนนพนักงานจากตารางกะ, StoreHub clock-in, stock count และ input งานปฏิบัติการ</p>
        </div>
        <form className="performance-period-form">
          <label htmlFor="startDate">วันที่เริ่ม</label>
          <input id="startDate" name="startDate" type="date" defaultValue={activePeriod.startDate} />
          <label htmlFor="endDate">วันที่สิ้นสุด</label>
          <input id="endDate" name="endDate" type="date" defaultValue={activePeriod.endDate} />
          <button type="submit">ดูคะแนน</button>
          <div className="performance-period-shortcuts" aria-label="ช่วงวันที่ทางลัด">
            {periodShortcuts.map((shortcut) => (
              <Link key={shortcut.label} href={shortcut.href}>{shortcut.label}</Link>
            ))}
          </div>
        </form>
      </section>

      <section className="performance-summary-grid" aria-label="Performance summary">
        <article>
          <span>Team average</span>
          <strong>{summary.teamAverage}</strong>
        </article>
        <article>
          <span>ต่ำกว่า 60</span>
          <strong>{summary.belowSixty}</strong>
        </article>
        <article>
          <span>Stock issue</span>
          <strong>{summary.unresolvedStockIssues}</strong>
        </article>
        <article>
          <span>Missing clock-in</span>
          <strong>{summary.missingClockIns}</strong>
        </article>
      </section>

      <section className="performance-source-panel">
        <h3>Data source status</h3>
        <div>
          {performanceSourceStatuses.map((source) => (
            <article key={source.key} className={`performance-source-card${params.source === source.key ? " active" : ""}`}>
              <Link href={sourceHref(source.key, activePeriod, basePath)} className="performance-source-card-link">
                <strong>{source.label}</strong>
                <span className={`source-pill source-${source.status}`}>{statusLabel(source.status)}</span>
                <small>{source.detail}</small>
                <em>ดูแหล่งที่มา</em>
              </Link>
            </article>
          ))}
        </div>
      </section>

      {activeSourceDetail ? (
        <section className="performance-source-detail" aria-label="Source detail">
          <div>
            <p className="eyebrow">Source detail</p>
            <h3>{activeSourceDetail.title}</h3>
            <p>{activeSourceDetail.currentRange}</p>
          </div>
          <dl>
            <dt>แหล่งข้อมูล</dt>
            <dd>
              {activeSourceDetail.sourcePath.startsWith("https://") ? (
                <a href={activeSourceDetail.sourcePath} target="_blank" rel="noreferrer">
                  {activeSourceDetail.sourcePath}
                </a>
              ) : (
                activeSourceDetail.sourcePath
              )}
            </dd>
            <dt>ประเภท</dt>
            <dd>{activeSourceDetail.sourceType}</dd>
          </dl>
          <div className="performance-source-checks">
            {activeSourceDetail.whatToCheck.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="performance-manual-input-grid">
        <article className="performance-input-panel">
          <div>
            <p className="eyebrow">Complaint / service input</p>
            <h3>บันทึกปัญหาบริการรายวัน</h3>
          </div>
          {inputStatus === "service-saved" ? <p className="input-status success">บันทึกหัวข้อปัญหารายวันแล้ว</p> : null}
          {inputStatus === "service-error" ? <p className="input-status warning">บันทึกไม่สำเร็จ แต่หน้าไม่ค้างแล้ว กรุณาตรวจสิทธิ์ storage ของ production</p> : null}
          <form action={saveComplaintServiceAction} className="performance-input-form">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label>
              วันที่
              <input name="serviceDate" type="date" defaultValue={entryDate} />
            </label>
            <label>
              พนักงาน
              <select name="employeeName" defaultValue={staffOptions()[0]?.code}>
                {staffOptions().map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <label>
              ประเภท
              <select name="bucket" defaultValue="feedback">
                <option value="feedback">Feedback ลูกค้า</option>
                <option value="event_response">กิจกรรม / ตอบลูกค้า</option>
              </select>
            </label>
            <label>
              ระดับ
              <select name="severity" defaultValue="fixed_immediately">
                <option value="fixed_immediately">แก้ไขได้ทันที</option>
                <option value="repeated">ซ้ำเรื่องเดิม</option>
                <option value="severe">รุนแรง</option>
              </select>
            </label>
            <label>
              จำนวนครั้ง
              <input name="serviceCount" type="number" min="1" defaultValue="1" />
            </label>
            <label className="wide">
              หมายเหตุ
              <input name="serviceNote" placeholder="เช่น ตอบลูกค้าช้า / complaint เรื่องเดิม" />
            </label>
            <label className="wide">
              หลักฐาน (รูป/ลิงก์)
              <EvidenceImageInput name="serviceEvidence" />
            </label>
            <button type="submit">บันทึกเหตุการณ์</button>
          </form>
          <div className="performance-daily-records">
            <strong>รายการวันที่ {entryDate}</strong>
            {serviceRecordsForDay.length ? (
              serviceRecordsForDay.map((record) => (
                <span key={record.id}>{record.employeeName}: {record.bucket} / {record.severity} x {record.count}</span>
              ))
            ) : (
              <span>ยังไม่มี complaint/service วันนี้</span>
            )}
          </div>
        </article>

        <article className="performance-input-panel">
          <div>
            <p className="eyebrow">Assigned work input</p>
            <h3>บันทึกงานที่มอบหมายรายวัน</h3>
          </div>
          <form action={saveAssignedWorkAction} className="performance-input-form">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label>
              วันที่
              <input name="assignedDate" type="date" defaultValue={entryDate} />
            </label>
            <fieldset className="assign-multi wide">
              <legend>พนักงาน (เลือกได้หลายคน = งานเดียวกันมอบหลายคน)</legend>
              <div className="assign-multi__chips">
                <label className="assign-multi__chip assign-multi__chip--all">
                  <input type="checkbox" name="employeeName" value={ASSIGN_ALL_TEAM} />
                  ทั้งทีมบางแค (ทุกคน)
                </label>
                {staffOptions().map((option) => (
                  <label key={option.code} className="assign-multi__chip">
                    <input type="checkbox" name="employeeName" value={option.code} />
                    {option.label}
                  </label>
                ))}
              </div>
              <small className="assign-multi__hint">
                เลือกหลายคน = สร้างงานเดียวกันให้แต่ละคน (ให้คะแนนแยกรายคน แต่รู้ว่าเป็นงานเดียวกัน)
              </small>
            </fieldset>
            <label>
              สถานะ
              <select name="assignedStatus" defaultValue="on_time">
                <option value="early_quality">เสร็จก่อนกำหนด พร้อมคุณภาพ</option>
                <option value="on_time">เสร็จตรงเวลา</option>
                <option value="needs_revision">เสร็จแต่ต้องแก้ไข</option>
                <option value="late_one_day">ช้ากว่ากำหนดไม่เกิน 1 วัน</option>
                <option value="not_finished">ไม่เสร็จเกินกำหนด</option>
              </select>
            </label>
            <label className="wide">
              งาน
              <input name="assignedTitle" placeholder="เช่น เพิ่ม stock card Lorcana" />
            </label>
            <label className="wide">
              หมายเหตุ
              <input name="assignedNote" placeholder="กำหนดส่ง / เหตุผล / รายละเอียดงาน" />
            </label>
            <label className="wide">
              หลักฐาน (รูป/ลิงก์)
              <EvidenceImageInput name="assignedEvidence" />
            </label>
            <button type="submit">บันทึกงานที่มอบหมาย</button>
          </form>
          <div className="performance-daily-records">
            <strong>รายการวันที่ {entryDate}</strong>
            {assignedRecordsForDay.length ? (
              groupAssignedRecords(assignedRecordsForDay).map((group) =>
                group.groupId ? (
                  <span key={group.groupId}>
                    👥 {group.title}: {group.members.map((m) => displayNameFor(m.employeeName)).join(", ")} / {group.status}
                  </span>
                ) : (
                  <span key={group.members[0].id}>
                    {displayNameFor(group.members[0].employeeName)}: {group.title} / {group.status}
                  </span>
                )
              )
            ) : (
              <span>ยังไม่มีงานที่มอบหมายวันนี้</span>
            )}
          </div>
        </article>
      </section>

      <section className="performance-score-table">
        <div className="performance-table-head">
          <span>พนักงาน</span>
          <span>คะแนนรวม</span>
          <span>Incentive</span>
          <span>Breakdown</span>
          <span>สถานะ</span>
        </div>
        {rows.map((row) => (
          <article key={row.employeeName} className="performance-score-row">
            <div>
              {/* rows are keyed by staff code; show the name the rest of the site shows */}
              <strong>{displayNameFor(row.employeeName)}</strong>
              <small>{row.deductions.length} deduction event(s)</small>
            </div>
            <div>
              <strong>{row.hasData ? `${row.totalScore}/100` : "—"}</strong>
              <small>{row.hasData ? row.incentive.label : "ไม่มีข้อมูลรอบนี้"}</small>
            </div>
            <div>
              <strong>{row.hasData ? `${row.incentive.percent}%` : "—"}</strong>
              <small>{!row.hasData ? "ยังไม่มีกะในรอบนี้" : row.incentive.requiresCoaching ? "ต้องประเมินรายสัปดาห์" : "ผ่านเกณฑ์รอบนี้"}</small>
              {isOwner && row.salaryDeduction.amount > 0 ? (
                <small className="score-badge score-badge-red" title={row.salaryDeduction.basis}>
                  หักเงิน {row.salaryDeduction.amount.toLocaleString("th-TH")} บาท (ขาด {row.salaryDeduction.pointsShort} คะแนน)
                </small>
              ) : null}
            </div>
            <div className="performance-category-grid">
              {Object.entries(row.categories).map(([key, result]) => (
                <span key={key}>
                  {categoryLabels[key as keyof typeof categoryLabels]} {result.score}/{result.maxScore}
                </span>
              ))}
            </div>
            <div>
              <span className={row.flags.includes("coaching_required") ? "score-badge score-badge-red" : "score-badge score-badge-green"}>
                {row.flags.includes("coaching_required") ? "Coach 4 weeks" : "OK"}
              </span>
              <small>
                ลาป่วย {row.leaveSummary.sickUsed}/{row.leaveSummary.sickAllowance} · ลากิจ {row.leaveSummary.personalUsed}/{row.leaveSummary.personalAllowance}
              </small>
            </div>
            <details className="performance-detail">
              <summary>ดูเหตุผลการหักคะแนน</summary>
              {row.leaveSummary.records.length ? (
                <div className="performance-leave-list">
                  {row.leaveSummary.records.map((leave) => (
                    <span key={`${leave.type}-${leave.workDate}`}>
                      {leave.workDate}: {leave.type === "sick" ? "ลาป่วย" : "ลากิจ"} ไม่นับหักคะแนนเข้างาน
                    </span>
                  ))}
                </div>
              ) : null}
              {row.deductions.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>หมวด</th>
                      <th>หัก</th>
                      <th>เหตุผล</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.deductions.map((deduction, index) => (
                      <tr key={`${deduction.reason}-${index}`}>
                        <td>{deduction.category}</td>
                        <td>-{deduction.points}</td>
                        <td>{deduction.detail}</td>
                        <td>{deduction.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>ไม่มีรายการหักคะแนนในรอบนี้</p>
              )}
              {row.warnings.length ? (
                <div className="performance-warning-list">
                  {row.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              ) : null}
            </details>
          </article>
        ))}
      </section>

    </main>
  );
}
