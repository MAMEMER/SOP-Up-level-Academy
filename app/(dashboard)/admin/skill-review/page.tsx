import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../../../../lib/auth.ts";
import { displayNameFor, employeeDirectory } from "../../../../lib/employee-directory.ts";
import { sopUserForEmail } from "../../../../lib/sop-users.ts";
import { formatWorkDate } from "../../../../lib/workflow-records.ts";
import { fetchAttendanceSource } from "../../../../lib/planner-kpi.ts";
import { careerStages, maxLevelFor, skillIndicators, type SkillIndicator } from "../../../../lib/skill-indicators.ts";
import {
  evaluateSkill,
  mondayOf,
  reviewDeadline,
  reviewWeekFor,
  skillResultOptions,
  weekWorkDays,
  addDays
} from "../../../../lib/skill-progress.ts";
import {
  confirmSkillResult,
  mergeSkillReview,
  setSkillLevel,
  skillEntriesFor,
  skillReviewId,
  type SkillLevelsRecord,
  type SkillResultInput
} from "../../../../lib/skill-reviews.ts";
import {
  fetchSkillLevels,
  fetchSkillReviewsForStaff,
  fetchSkillReviewsForWeek,
  saveSkillLevels,
  saveSkillReview
} from "../../../../lib/skill-review-store.ts";

// หน้าทดสอบระบบประเมิน skill รายสัปดาห์ — เห็นเฉพาะแอดมิน. แยกจาก KPI/เงินเดือนทั้งหมด:
// ไม่มีอะไรในหน้านี้ส่งผลกับคะแนน performance-score.

type PageProps = {
  searchParams?: Promise<{ week?: string; staff?: string; status?: string }>;
};

function isDateValue(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function back(week: string, staff: string, status: string): never {
  const params = new URLSearchParams({ week, status });
  if (staff) params.set("staff", staff);
  redirect(`/admin/skill-review?${params.toString()}#staff`);
}

async function requireWriter(week: string, staff: string) {
  const user = await requireUser();
  if (user.role !== "admin" || user.isImpersonating) back(week, staff, "denied");
  return user;
}

function knownStaff(code: string) {
  return employeeDirectory.some((entry) => entry.code === code);
}

async function saveReviewAction(formData: FormData) {
  "use server";
  const week = stringValue(formData, "week");
  const staff = stringValue(formData, "staff");
  const user = await requireWriter(week, staff);
  if (!isDateValue(week) || mondayOf(week) !== week || !knownStaff(staff)) back(week, staff, "error");

  const rows: SkillResultInput[] = [];
  for (const indicator of skillIndicators) {
    const result = stringValue(formData, `r_${indicator.id}`);
    if (!result) continue;
    rows.push({
      indicatorId: indicator.id,
      result,
      note: stringValue(formData, `n_${indicator.id}`),
      serious: formData.get(`s_${indicator.id}`) === "on"
    });
  }
  // "ต่ำกว่าระดับ" และ "ร้ายแรง" มีผลกับระดับ — ต้องเขียนว่าเห็นอะไร
  if (rows.some((row) => (row.result === "below" || row.serious) && !row.note)) back(week, staff, "missing_note");

  try {
    const attendance = await fetchAttendanceSource().catch(() => null);
    const workDays = attendance ? weekWorkDays(week, staff, attendance.schedules, attendance.clockEvents) : undefined;
    const existing = (await fetchSkillReviewsForWeek(week)).find((record) => record.staffCode === staff);
    const record = mergeSkillReview(existing, {
      weekStart: week,
      staffCode: staff,
      rows,
      workDays,
      by: user.actualEmail,
      at: new Date().toISOString()
    });
    await saveSkillReview(record);
  } catch {
    back(week, staff, "error");
  }
  revalidatePath("/admin/skill-review");
  back(week, staff, "saved");
}

async function confirmAction(formData: FormData) {
  "use server";
  const week = stringValue(formData, "week");
  const staff = stringValue(formData, "staff");
  const user = await requireWriter(week, staff);
  const indicatorId = stringValue(formData, "indicator");
  let next = null;
  try {
    const existing = (await fetchSkillReviewsForWeek(week)).find((record) => record.staffCode === staff);
    next = existing ? confirmSkillResult(existing, indicatorId, user.actualEmail, new Date().toISOString()) : null;
    if (next) await saveSkillReview(next);
  } catch {
    back(week, staff, "error");
  }
  if (!next) back(week, staff, "confirm_denied");
  revalidatePath("/admin/skill-review");
  back(week, staff, "confirmed");
}

async function setLevelsAction(formData: FormData) {
  "use server";
  const week = stringValue(formData, "week");
  const staff = stringValue(formData, "staff");
  const user = await requireWriter(week, staff);
  if (!knownStaff(staff)) back(week, staff, "error");
  const reason = stringValue(formData, "reason");
  if (!reason) back(week, staff, "missing_reason");

  try {
    let record: SkillLevelsRecord | undefined = await fetchSkillLevels(staff);
    let changed = false;
    const at = new Date().toISOString();
    for (const indicator of skillIndicators) {
      const raw = stringValue(formData, `lv_${indicator.id}`);
      if (raw === "") continue;
      const next = setSkillLevel(record, {
        staffCode: staff,
        indicatorId: indicator.id,
        level: Number(raw),
        date: formatWorkDate(),
        reason,
        by: user.actualEmail,
        at
      });
      if (next) {
        record = next;
        changed = true;
      }
    }
    if (changed && record) await saveSkillLevels(record);
  } catch {
    back(week, staff, "error");
  }
  revalidatePath("/admin/skill-review");
  back(week, staff, "levels_saved");
}

const statusMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  saved: { tone: "success", text: "บันทึกผลสัปดาห์นี้แล้ว" },
  confirmed: { tone: "success", text: "ยืนยันผลตัวเสี่ยงสูงแล้ว" },
  levels_saved: { tone: "success", text: "บันทึกระดับแล้ว (เก็บประวัติไว้ทุกครั้ง)" },
  denied: { tone: "warning", text: "ไม่มีสิทธิ์แก้ไข (ต้องเป็นแอดมิน และไม่ได้อยู่ในโหมดดูแทนพนักงาน)" },
  confirm_denied: { tone: "warning", text: "ยืนยันไม่ได้ — คนที่ลงผลยืนยันเองไม่ได้ ต้องเป็นผู้ประเมินอีกคน" },
  missing_note: { tone: "warning", text: "แถวที่เลือก \"ต่ำกว่าระดับ\" หรือติ๊ก \"ร้ายแรง\" ต้องเขียนหมายเหตุว่าเห็นอะไร" },
  missing_reason: { tone: "warning", text: "ต้องเขียนเหตุผลก่อนเปลี่ยนระดับ" },
  error: { tone: "warning", text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }
};

function reviewerName(email: string | undefined) {
  if (!email) return "";
  return sopUserForEmail(email)?.name || email.split("@")[0];
}

function thaiDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

function requiredText(indicator: SkillIndicator) {
  return careerStages
    .map((stage) => `${stage.label} ${indicator.required[stage.id] || "–"}`)
    .join(" · ");
}

function targetCriteria(indicator: SkillIndicator, target: number | null) {
  if (target === null) return "ถึงระดับสูงสุดแล้ว";
  if (target === 1) {
    return indicator.group === "hard"
      ? "ระดับ 1: ทำได้เมื่อมีผู้ถือระดับ 3 อยู่ด้วย · เรียนครบ + สอบความรู้ผ่าน ≥ 80%"
      : "ระดับ 1: ผู้ประเมินเห็นพฤติกรรมระดับ 1 อย่างน้อย 1 สัปดาห์";
  }
  if (target === 2) return `ระดับ 2: ${indicator.criteria.l2}`;
  if (target === 3) return `ระดับ 3: ${indicator.criteria.l3}`;
  return "ระดับ 4: ปรับขั้นตอน เขียนคู่มือ ออกข้อสอบ — ทำโครงการปรับปรุง 1 ชิ้นที่วัดผลได้";
}

export default async function AdminSkillReviewPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const params = searchParams ? await searchParams : {};
  const today = formatWorkDate();
  const week = isDateValue(params.week) ? mondayOf(params.week) : reviewWeekFor(today);
  const staff = params.staff && knownStaff(params.staff) ? params.staff : "";
  const status = params.status ? statusMessages[params.status] : undefined;
  const deadline = reviewDeadline(week);
  const late = today > deadline;

  const [attendance, weekReviews] = await Promise.all([
    fetchAttendanceSource().catch(() => null),
    fetchSkillReviewsForWeek(week).catch(() => [])
  ]);

  const staffRows = employeeDirectory
    .map((entry) => {
      const days = attendance
        ? weekWorkDays(week, entry.code, attendance.schedules, attendance.clockEvents)
        : { planned: 0, worked: 0 };
      const review = weekReviews.find((record) => record.staffCode === entry.code);
      return { code: entry.code, name: entry.displayName, days, filled: review ? Object.keys(review.results).length : 0 };
    })
    .sort((left, right) => right.days.planned - left.days.planned || left.name.localeCompare(right.name));

  const selected = staff ? staffRows.find((row) => row.code === staff) : undefined;
  const [history, levels] = staff
    ? await Promise.all([fetchSkillReviewsForStaff(staff).catch(() => []), fetchSkillLevels(staff).catch(() => undefined)])
    : [[], undefined];
  const current = history.find((record) => record.id === skillReviewId(week, staff));

  const rows = skillIndicators.map((indicator) => {
    const state = levels?.levels[indicator.id];
    const level = state?.level ?? 0;
    const progress = evaluateSkill({
      entries: skillEntriesFor(history, staff, indicator.id),
      level,
      levelSince: state?.since,
      highRisk: indicator.highRisk,
      maxLevel: maxLevelFor(indicator),
      asOf: week
    });
    return { indicator, level, progress, entry: current?.results[indicator.id] };
  });
  const pendingConfirm = rows.filter((row) => row.indicator.highRisk && row.entry && !row.entry.confirmedBy && row.entry.result !== "na");
  const suggestions = rows.filter((row) => row.progress.suggestion.kind !== "none");

  return (
    <main className="page skill-review">
      <Link href="/" className="back-link">← กลับ Dashboard</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ทดสอบระบบ · เห็นเฉพาะแอดมิน</p>
          <h2>ประเมิน skill รายสัปดาห์</h2>
          <p>
            ประเมินทุกวันจันทร์ ลงผลภายใน 3 วัน · 15 ตัวชี้วัด (Hard 7 · Soft 8) ตามคู่มือประเมิน skill
            หน้านี้ <strong>ไม่ผูกกับ KPI หรือเงินเดือน</strong> ระบบแค่เสนอขึ้น/ลดระดับ แอดมินเป็นคนยืนยัน
          </p>
        </div>
        <form className="owner-ops__date">
          <label>
            สัปดาห์ที่ประเมิน (เลือกวันไหนก็ได้ในสัปดาห์)
            <input type="date" name="week" defaultValue={week} />
          </label>
          {staff ? <input type="hidden" name="staff" value={staff} /> : null}
          <button type="submit">ดู</button>
        </form>
      </section>

      <p className={`skill-review__week${late ? " is-late" : ""}`}>
        สัปดาห์ {thaiDate(week)} – {thaiDate(addDays(week, 6))} · ลงผลภายใน {thaiDate(deadline)}
        {late ? " · เลยกำหนดลงผลแล้ว" : ""}
      </p>

      {status ? <p className={`input-status ${status.tone}`}>{status.text}</p> : null}

      <section className="owner-ops__panel">
        <div className="section-heading">
          <p className="eyebrow">เลือกพนักงาน</p>
          <h3>ใครเข้ากะสัปดาห์นี้</h3>
        </div>
        {!attendance ? <p className="owner-ops__empty">อ่านตารางกะไม่ได้ — จำนวนวันทำงานจะขึ้นเป็น 0</p> : null}
        <ul className="skill-review__staff">
          {staffRows.map((row) => (
            <li key={row.code}>
              <Link
                href={`/admin/skill-review?week=${week}&staff=${encodeURIComponent(row.code)}#staff`}
                className={row.code === staff ? "is-active" : undefined}
              >
                <strong>{row.name}</strong>
                <small>
                  มา {row.days.worked}/{row.days.planned} วัน · ลงผล {row.filled}/{skillIndicators.length}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <>
          <section className="owner-ops__panel" id="staff">
            <div className="section-heading">
              <p className="eyebrow">สัปดาห์ {thaiDate(week)}</p>
              <h3>{selected.name}</h3>
            </div>
            <p className="skill-review__days">
              วันทำงานสัปดาห์นี้: มาจริง <strong>{selected.days.worked}</strong> วัน จากที่มีกะ {selected.days.planned} วัน
              · ใช้ประกอบการพิจารณา ไม่เปลี่ยนเกณฑ์
            </p>

            {pendingConfirm.length ? (
              <div className="skill-review__notice">
                <strong>ตัวเสี่ยงสูงรอผู้ประเมินคนที่ 2 ยืนยัน</strong>
                {pendingConfirm.map((row) => (
                  <form key={row.indicator.id} action={confirmAction} className="skill-review__inline">
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="staff" value={staff} />
                    <input type="hidden" name="indicator" value={row.indicator.id} />
                    <span>
                      {row.indicator.name} · ลงผลโดย {reviewerName(row.entry?.by)}
                    </span>
                    <button type="submit" disabled={row.entry?.by === user.actualEmail}>
                      {row.entry?.by === user.actualEmail ? "รออีกคนยืนยัน" : "ยืนยันผลนี้"}
                    </button>
                  </form>
                ))}
              </div>
            ) : null}

            {suggestions.length ? (
              <div className="skill-review__notice is-suggest">
                <strong>ข้อเสนอจากระบบ (ยังไม่เปลี่ยนระดับจนกว่าจะยืนยันในส่วน "ตั้งระดับ" ด้านล่าง)</strong>
                <ul>
                  {suggestions.map((row) => (
                    <li key={row.indicator.id}>
                      {row.indicator.name}: {row.progress.suggestion.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form action={saveReviewAction} className="skill-review__form">
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="staff" value={staff} />
              {(["hard", "soft"] as const).map((group) => (
                <fieldset key={group} className={`skill-review__group is-${group}`}>
                  <legend>{group === "hard" ? "Hard skill · 7 ตัวชี้วัด" : "Soft skill · 8 ตัวชี้วัด"}</legend>
                  {rows
                    .filter((row) => row.indicator.group === group)
                    .map((row) => (
                      <div key={row.indicator.id} className="skill-review__row">
                        <div className="skill-review__head">
                          <strong>
                            {row.indicator.name}
                            {row.indicator.highRisk ? <span className="skill-review__risk">เสี่ยงสูง</span> : null}
                          </strong>
                          <span className="skill-review__level">ระดับ {row.level}</span>
                        </div>
                        <small className="skill-review__meta">ขั้นต่ำ: {requiredText(row.indicator)}</small>
                        <p className="skill-review__criteria">{targetCriteria(row.indicator, row.progress.target)}</p>
                        <small className="skill-review__meta">
                          ความคืบหน้า: {row.progress.text} · หลักฐาน: {row.indicator.evidence}
                        </small>
                        <div className="skill-review__choices" role="radiogroup" aria-label={row.indicator.name}>
                          {skillResultOptions.map((option) => (
                            <label key={option.value} className={`skill-review__choice is-${option.value}`}>
                              <input
                                type="radio"
                                name={`r_${row.indicator.id}`}
                                value={option.value}
                                defaultChecked={row.entry?.result === option.value}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="skill-review__note">
                          <input
                            name={`n_${row.indicator.id}`}
                            defaultValue={row.entry?.note || ""}
                            placeholder="หลักฐาน 1 บรรทัด เช่น ส่งเช็คลิสต์ครบ 5/5 วัน"
                          />
                          <label className="skill-review__serious">
                            <input type="checkbox" name={`s_${row.indicator.id}`} defaultChecked={Boolean(row.entry?.serious)} />
                            ร้ายแรง/จงใจ
                          </label>
                        </div>
                        {row.entry ? (
                          <small className="skill-review__meta">
                            ลงผลโดย {reviewerName(row.entry.by)}
                            {row.entry.confirmedBy ? ` · ยืนยันโดย ${reviewerName(row.entry.confirmedBy)}` : ""}
                          </small>
                        ) : null}
                      </div>
                    ))}
                </fieldset>
              ))}
              <div className="skill-review__submit">
                <button type="submit">บันทึกผลสัปดาห์นี้</button>
              </div>
            </form>
          </section>

          <section className="owner-ops__panel">
            <div className="section-heading">
              <p className="eyebrow">ตั้งระดับ</p>
              <h3>ระดับปัจจุบันของ {selected.name}</h3>
            </div>
            <p className="skill-review__days">
              ใช้ตั้งระดับเริ่มต้น หรือยืนยันข้อเสนอขึ้น/ลดระดับ · ทุกครั้งเก็บประวัติพร้อมเหตุผล ไม่เขียนทับของเดิม
            </p>
            <form action={setLevelsAction} className="skill-review__levels">
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="staff" value={staff} />
              {rows.map((row) => (
                <label key={row.indicator.id}>
                  <span>{row.indicator.name}</span>
                  <select name={`lv_${row.indicator.id}`} defaultValue={String(row.level)}>
                    {Array.from({ length: maxLevelFor(row.indicator) + 1 }, (_, level) => (
                      <option key={level} value={level}>
                        ระดับ {level}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="wide">
                <span>เหตุผล</span>
                <input name="reason" placeholder="เช่น ระดับตั้งต้นจากการประเมินเดือนแรก / ครบเกณฑ์ขึ้นระดับ 2" />
              </label>
              <button type="submit">บันทึกระดับ</button>
            </form>
            {levels?.history.length ? (
              <ul className="owner-ops__list">
                {[...levels.history]
                  .reverse()
                  .slice(0, 12)
                  .map((item, index) => (
                    <li key={`${item.indicatorId}-${item.date}-${index}`}>
                      <strong>
                        {item.date} · {skillIndicators.find((indicator) => indicator.id === item.indicatorId)?.name} · {item.from} → {item.to}
                      </strong>
                      <small>
                        {item.reason} · โดย {reviewerName(item.by)}
                      </small>
                    </li>
                  ))}
              </ul>
            ) : null}
          </section>

          {history.length ? (
            <section className="owner-ops__panel">
              <div className="section-heading">
                <p className="eyebrow">ย้อนหลัง</p>
                <h3>ผลรายสัปดาห์ของ {displayNameFor(staff)}</h3>
              </div>
              <ul className="owner-ops__list">
                {[...history]
                  .sort((left, right) => right.weekStart.localeCompare(left.weekStart))
                  .slice(0, 12)
                  .map((record) => {
                    const counts = Object.values(record.results).reduce<Record<string, number>>((acc, entry) => {
                      acc[entry.result] = (acc[entry.result] || 0) + 1;
                      return acc;
                    }, {});
                    return (
                      <li key={record.id}>
                        <Link href={`/admin/skill-review?week=${record.weekStart}&staff=${encodeURIComponent(staff)}#staff`}>
                          <strong>สัปดาห์ {thaiDate(record.weekStart)}</strong>
                        </Link>
                        <small>
                          ผ่านระดับถัดไป {counts.next || 0} · คงระดับ {counts.hold || 0} · ต่ำกว่าระดับ {counts.below || 0} · ไม่ได้ทำ{" "}
                          {counts.na || 0}
                          {record.workDays ? ` · มา ${record.workDays.worked}/${record.workDays.planned} วัน` : ""}
                        </small>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="owner-ops__empty">เลือกพนักงานด้านบนเพื่อเริ่มลงผล</p>
      )}
    </main>
  );
}
