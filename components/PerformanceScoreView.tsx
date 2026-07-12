import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getPerformanceScoreRowsForRange,
  getPerformanceScoreRows,
  getPerformanceSummary,
  getPerformanceSourceDetail,
  performanceSourceStatuses,
  type PerformanceReviewPeriod
} from "../lib/performance-score-data.ts";
import {
  assignedWorkRecordsForDate,
  customerServiceRecordsForDate,
  readPerformanceDailyStore,
  saveAssignedWorkRecord,
  saveCustomerServiceRecord
} from "../lib/performance-service-records.ts";
import { readPerformanceSourceFiles, savePerformanceSourceFilePath } from "../lib/performance-source-files.ts";

type PageProps = {
  searchParams?: Promise<{ period?: string; startDate?: string; endDate?: string; source?: string; inputStatus?: string }>;
};

type PerformanceScoreViewProps = PageProps & {
  basePath?: "/admin/performance-score" | "/performance-score";
  showAdminBackLink?: boolean;
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
  if (params.period === "previous-half-month") {
    return { id: "previous-half-month", label: "ครึ่งเดือนที่แล้ว", startDate: "2026-06-16", endDate: "2026-06-30" };
  }
  return { id: "july-to-date", label: "1 ก.ค. 2026 ถึงปัจจุบัน", startDate: "2026-07-01", endDate: "2026-07-09" };
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

function csvSourceKey(value: string) {
  return value === "stock" ? "stock" : "attendance";
}

function sourceCsvPath(sourceKey: string, sourceFiles: ReturnType<typeof readPerformanceSourceFiles>) {
  if (sourceKey === "attendance") return sourceFiles.attendanceCsvPath;
  if (sourceKey === "stock") return sourceFiles.stockCsvPath;
  return "";
}

async function saveComplaintServiceAction(formData: FormData) {
  "use server";
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));
  let inputStatus: "service-saved" | "service-error" = "service-saved";
  try {
    saveCustomerServiceRecord({
      workDate: stringValue(formData, "serviceDate"),
      employeeName: stringValue(formData, "employeeName"),
      bucket: serviceBucket(stringValue(formData, "bucket")),
      severity: serviceSeverity(stringValue(formData, "severity")),
      count: Number(stringValue(formData, "serviceCount") || "1"),
      note: stringValue(formData, "serviceNote")
    });
  } catch {
    inputStatus = "service-error";
  }
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect(withInputStatus(redirectTo, inputStatus));
}

async function saveAssignedWorkAction(formData: FormData) {
  "use server";
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));
  const title = stringValue(formData, "assignedTitle");
  if (title) {
    saveAssignedWorkRecord({
      workDate: stringValue(formData, "assignedDate"),
      employeeName: stringValue(formData, "employeeName"),
      title,
      status: assignedStatus(stringValue(formData, "assignedStatus")),
      note: stringValue(formData, "assignedNote")
    });
  }
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect(redirectTo);
}

async function saveCsvSourcePathAction(formData: FormData) {
  "use server";
  const redirectTo = safeRedirectTo(formData.get("redirectTo"));
  const sourcePath = stringValue(formData, "sourcePath");
  if (sourcePath) {
    savePerformanceSourceFilePath(csvSourceKey(stringValue(formData, "sourceKey")), sourcePath);
  }
  revalidatePath("/admin/performance-score");
  revalidatePath("/performance-score");
  redirect(redirectTo);
}

export async function PerformanceScoreView({ searchParams, basePath = "/admin/performance-score", showAdminBackLink = false }: PerformanceScoreViewProps) {
  const params = searchParams ? await searchParams : {};
  const activePeriod = resolvePeriod(params);
  const rows = activePeriod.id === "custom" ? getPerformanceScoreRowsForRange(activePeriod) : getPerformanceScoreRows(activePeriod.id);
  const summary = getPerformanceSummary(rows);
  const activeSourceDetail = getPerformanceSourceDetail(params.source || "");
  const redirectTo = `${basePath}?startDate=${activePeriod.startDate}&endDate=${activePeriod.endDate}${params.source ? `&source=${params.source}` : ""}`;
  const inputStatus = params.inputStatus;
  const entryDate = activePeriod.endDate;
  const dailyStore = readPerformanceDailyStore();
  const sourceFiles = readPerformanceSourceFiles();
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
              {sourceCsvPath(source.key, sourceFiles) ? (
                <form action={saveCsvSourcePathAction} className="performance-source-file-form">
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <input type="hidden" name="sourceKey" value={source.key} />
                  <label>
                    ไฟล์ CSV ที่ใช้วิเคราะห์
                    <input name="sourcePath" defaultValue={sourceCsvPath(source.key, sourceFiles)} />
                  </label>
                  <button type="submit">ใช้ไฟล์นี้</button>
                </form>
              ) : null}
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
              <select name="employeeName" defaultValue="ICE">
                <option value="ICE">ICE</option>
                <option value="Boom">Boom</option>
                <option value="Leo">Leo</option>
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
            <label>
              พนักงาน
              <select name="employeeName" defaultValue="ICE">
                <option value="ICE">ICE</option>
                <option value="Boom">Boom</option>
                <option value="Leo">Leo</option>
                <option value="ทีม บางแค">ทีม บางแค</option>
              </select>
            </label>
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
            <button type="submit">บันทึกงานที่มอบหมาย</button>
          </form>
          <div className="performance-daily-records">
            <strong>รายการวันที่ {entryDate}</strong>
            {assignedRecordsForDay.length ? (
              assignedRecordsForDay.map((record) => (
                <span key={record.id}>{record.employeeName}: {record.title} / {record.status}</span>
              ))
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
              <strong>{row.employeeName}</strong>
              <small>{row.deductions.length} deduction event(s)</small>
            </div>
            <div>
              <strong>{row.totalScore}/100</strong>
              <small>{row.incentive.label}</small>
            </div>
            <div>
              <strong>{row.incentive.percent}%</strong>
              <small>{row.incentive.requiresCoaching ? "ต้องประเมินรายสัปดาห์" : "ผ่านเกณฑ์รอบนี้"}</small>
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

      {showAdminBackLink ? <Link href="/admin/performance" className="back-link">ดูหน้า performance เดิม</Link> : null}
    </main>
  );
}
