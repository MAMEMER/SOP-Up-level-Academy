"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWorkRecordsForEveryone } from "../lib/work-records-client.ts";
import { dailyScopeKey, monthlyScopeKey, weeklyScopeKey, type WorkRecordDoc } from "../lib/work-records.ts";
import {
  elapsedSeconds,
  formatWorkDate,
  isWorkflowRecordOnTime,
  type WorkflowDailyRecord,
  type WorkflowDayPayload
} from "../lib/workflow-records.ts";
import { weeklyEventPeriodKey } from "../lib/weekly-event-store.ts";
import { monthlyEventScopeKey } from "../lib/monthly-event-store.ts";
import { bangkokMonthKey } from "../lib/monthly-event-tasks.ts";
import { fetchSubmitLog, summarisePresses, type SubmitLogEntry } from "../lib/submit-log-client.ts";
import {
  acceptAssignment,
  fetchAssignmentsForDate,
  requestAssignmentRevision,
  type AssignmentStatus,
  type WorkAssignment
} from "../lib/work-assignments-store.ts";
import { fetchVerdicts, saveVerdict } from "../lib/review-verdicts-client.ts";
import {
  REVIEW_STATUS_CLASS,
  REVIEW_STATUS_LABEL,
  reviewVerdictId,
  type ReviewScope,
  type ReviewStatus,
  type ReviewVerdict
} from "../lib/review-verdicts.ts";
import { countChecked, extractEvidence, isImageUrl, type ExtractedEvidence } from "../lib/review-evidence.ts";

// The owner's real review desk. Reads EVERY employee's submitted checklists from the
// central store (sop_work_records + work_assignments) — never localStorage / mock — and
// lets the owner look at the detail + evidence before approving or asking for a fix.

type TabKey = "daily" | "weekly" | "monthly" | "assigned";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "daily", label: "รายวัน" },
  { key: "weekly", label: "รายสัปดาห์" },
  { key: "monthly", label: "รายเดือน" },
  { key: "assigned", label: "งานที่มอบหมาย" }
];

const pressTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso)
  );

const timeOfDay = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(iso)
      )
    : "—";

/** ISO week key (mirrors the private helper the weekly/monthly stock checklists write with). */
function formatWorkWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const dateAt = (workDate: string) => new Date(`${workDate}T12:00:00+07:00`);

// ---------------------------------------------------------------------------
// Shared verdict controls (daily / weekly / monthly)
// ---------------------------------------------------------------------------

type VerdictIdentity = {
  scope: ReviewScope;
  scopeKey: string;
  employeeKey: string;
  employeeName: string;
  unitId: string;
  unitLabel: string;
};

function VerdictBadge({ verdict }: { verdict: ReviewVerdict | undefined }) {
  if (!verdict) return <em className="mrev-badge mrev-badge--pending">รอตรวจ</em>;
  return <em className={`mrev-badge ${REVIEW_STATUS_CLASS[verdict.status]}`}>{REVIEW_STATUS_LABEL[verdict.status]}</em>;
}

function VerdictControls({
  identity,
  verdict,
  onSaved
}: {
  identity: VerdictIdentity;
  verdict: ReviewVerdict | undefined;
  onSaved: (verdict: ReviewVerdict) => void;
}) {
  const [note, setNote] = useState(verdict?.note ?? "");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(status: ReviewStatus) {
    setError(null);
    if (status === "needs_fix" && !note.trim()) {
      setError("พิมพ์สิ่งที่ต้องแก้ก่อนกดให้แก้ไข");
      return;
    }
    setBusy(status);
    try {
      const saved = await saveVerdict({ ...identity, status, note: note.trim() });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ ลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mrev-verdict">
      {verdict ? (
        <p className="mrev-verdict__meta">
          {REVIEW_STATUS_LABEL[verdict.status]} · {verdict.reviewedByName || verdict.reviewedBy} ·{" "}
          {timeOfDay(verdict.reviewedAt)}
          {verdict.note ? <span className="mrev-verdict__note"> — “{verdict.note}”</span> : null}
        </p>
      ) : null}
      <textarea
        className="mrev-verdict__input"
        placeholder="ข้อความถึงพนักงาน (จำเป็นเมื่อขอให้แก้ไข)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
      />
      <div className="mrev-verdict__actions">
        <button
          type="button"
          className="mrev-btn mrev-btn--approve"
          disabled={busy !== null}
          onClick={() => act("approved")}
        >
          {busy === "approved" ? "กำลังบันทึก…" : "อนุมัติงาน"}
        </button>
        <button
          type="button"
          className="mrev-btn mrev-btn--fix"
          disabled={busy !== null}
          onClick={() => act("needs_fix")}
        >
          {busy === "needs_fix" ? "กำลังบันทึก…" : "ขอให้แก้ไข"}
        </button>
      </div>
      {error ? <p className="mrev-error">{error}</p> : null}
    </div>
  );
}

function EvidenceView({ evidence }: { evidence: ExtractedEvidence }) {
  const hasAny = evidence.photos.length || evidence.links.length || evidence.texts.length;
  if (!hasAny) return <p className="mrev-muted">ไม่มีหลักฐาน/รายละเอียดแนบมา</p>;
  return (
    <div className="mrev-evidence">
      {evidence.photos.length ? (
        <div className="mrev-evidence__photos">
          {evidence.photos.map((url) =>
            isImageUrl(url) ? (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img className="evidence-input__preview" src={url} alt="หลักฐาน" loading="lazy" />
              </a>
            ) : (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="mrev-link">
                เปิดไฟล์แนบ
              </a>
            )
          )}
        </div>
      ) : null}
      {evidence.texts.length ? (
        <dl className="mrev-evidence__texts">
          {evidence.texts.map((entry, index) => (
            <div key={`${entry.label}:${index}`}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {evidence.links.length ? (
        <ul className="mrev-evidence__links">
          {evidence.links.map((link, index) => (
            <li key={`${link.url}:${index}`}>
              <a href={link.url} target="_blank" rel="noreferrer" className="mrev-link">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card models
// ---------------------------------------------------------------------------

type VerdictMap = Record<string, ReviewVerdict>;

const verdictKey = (identity: VerdictIdentity) =>
  reviewVerdictId(identity.scope, identity.scopeKey, identity.employeeKey, identity.unitId);

type DailyPerson = {
  employeeKey: string;
  employeeName: string;
  branch: string;
  records: WorkflowDailyRecord[];
  evidence: ExtractedEvidence;
};

type TeamCard = {
  id: string;
  scope: ReviewScope;
  scopeKey: string;
  employeeKey: string;
  employeeName: string;
  title: string;
  progress: string;
  evidence: ExtractedEvidence;
};

// ---------------------------------------------------------------------------
// Main board
// ---------------------------------------------------------------------------

export function ManagerReviewBoard({ branch }: { branch: string }) {
  const [tab, setTab] = useState<TabKey>("daily");
  const [workDate, setWorkDate] = useState(formatWorkDate());
  const [loaded, setLoaded] = useState(false);
  const [verdicts, setVerdicts] = useState<VerdictMap>({});

  const [daily, setDaily] = useState<DailyPerson[]>([]);
  const [presses, setPresses] = useState<SubmitLogEntry[]>([]);
  const [teamCards, setTeamCards] = useState<TeamCard[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);

  const onVerdictSaved = useCallback((saved: ReviewVerdict) => {
    setVerdicts((prev) => ({ ...prev, [saved.key]: saved }));
  }, []);

  const mergeVerdicts = useCallback((list: ReviewVerdict[]) => {
    setVerdicts((prev) => {
      const next = { ...prev };
      for (const verdict of list) next[verdict.key] = verdict;
      return next;
    });
  }, []);

  // ---- loaders ------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    setLoaded(false);

    async function load() {
      if (tab === "daily") {
        const scopeKey = dailyScopeKey(workDate);
        const [{ records: docs }, log, verdictList] = await Promise.all([
          fetchWorkRecordsForEveryone("daily", scopeKey).then((r) => r).catch(() => ({ records: [] as WorkRecordDoc[] })),
          fetchSubmitLog(workDate).catch(() => [] as SubmitLogEntry[]),
          fetchVerdicts("daily", scopeKey).catch(() => [] as ReviewVerdict[])
        ]);
        if (!alive) return;
        const people: DailyPerson[] = (docs as WorkRecordDoc[])
          .map((doc) => {
            const payload = (doc.data as WorkflowDayPayload) ?? { records: [], notes: {}, details: {} };
            const records = (payload.records ?? []).filter(
              (record) => record.workDate === workDate && (record.status === "submitted" || record.status === "missed")
            );
            return {
              employeeKey: doc.employeeKey,
              employeeName: doc.employeeName || doc.employeeEmail,
              branch: doc.branch,
              records,
              evidence: extractEvidence([payload.details, payload.notes])
            };
          })
          .filter((person) => person.records.length > 0)
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
        setDaily(people);
        setPresses(log);
        mergeVerdicts(verdictList);
      } else if (tab === "weekly") {
        const eventKey = `${weeklyScopeKey(weeklyEventPeriodKey(workDate))}-event`;
        const stockKey = weeklyScopeKey(formatWorkWeek(dateAt(workDate)));
        const [eventDocs, stockDocs, evVerdicts, stVerdicts] = await Promise.all([
          fetchWorkRecordsForEveryone("weekly", eventKey).then((r) => r.records).catch(() => [] as WorkRecordDoc[]),
          fetchWorkRecordsForEveryone("weekly", stockKey).then((r) => r.records).catch(() => [] as WorkRecordDoc[]),
          fetchVerdicts("weekly", eventKey).catch(() => [] as ReviewVerdict[]),
          fetchVerdicts("weekly", stockKey).catch(() => [] as ReviewVerdict[])
        ]);
        if (!alive) return;
        const cards: TeamCard[] = [];
        for (const doc of eventDocs) {
          const data = (doc.data as { ticks?: Record<string, unknown>; data?: Record<string, unknown> }) ?? {};
          cards.push({
            id: `we:${doc.employeeKey}`,
            scope: "weekly",
            scopeKey: eventKey,
            employeeKey: doc.employeeKey,
            employeeName: doc.employeeName || "ทีมงาน",
            title: "Checklist งานอีเวนต์รายสัปดาห์",
            progress: `ติ๊กแล้ว ${countChecked(data.ticks)} รายการ`,
            evidence: extractEvidence([data.data])
          });
        }
        for (const doc of stockDocs) {
          const data = (doc.data as { checked?: Record<string, unknown>; details?: Record<string, unknown>; status?: string }) ?? {};
          cards.push({
            id: `ws:${doc.employeeKey}`,
            scope: "weekly",
            scopeKey: stockKey,
            employeeKey: doc.employeeKey,
            employeeName: doc.employeeName || "ทีมงาน",
            title: "นับ Stock อุปกรณ์ / Sleeve",
            progress: `ติ๊กแล้ว ${countChecked(data.checked)} รายการ${data.status ? ` · ${data.status}` : ""}`,
            evidence: extractEvidence([data.details])
          });
        }
        setTeamCards(cards);
        mergeVerdicts([...evVerdicts, ...stVerdicts]);
      } else if (tab === "monthly") {
        const monthKey = monthlyEventScopeKey(bangkokMonthKey(dateAt(workDate)));
        const stockKey = weeklyScopeKey(formatWorkWeek(dateAt(workDate))); // monthly-stock uses the w- prefix
        const [eventDocs, stockDocs, evVerdicts, stVerdicts] = await Promise.all([
          fetchWorkRecordsForEveryone("monthly", monthKey).then((r) => r.records).catch(() => [] as WorkRecordDoc[]),
          fetchWorkRecordsForEveryone("monthly", stockKey).then((r) => r.records).catch(() => [] as WorkRecordDoc[]),
          fetchVerdicts("monthly", monthKey).catch(() => [] as ReviewVerdict[]),
          fetchVerdicts("monthly", stockKey).catch(() => [] as ReviewVerdict[])
        ]);
        if (!alive) return;
        const cards: TeamCard[] = [];
        for (const doc of eventDocs) {
          const data = (doc.data as { states?: Record<string, unknown>; evidence?: Record<string, unknown> }) ?? {};
          const states = data.states ?? {};
          const done = Object.values(states).filter((v) => v === "done" || v === "submitted").length;
          cards.push({
            id: `me:${doc.employeeKey}`,
            scope: "monthly",
            scopeKey: monthKey,
            employeeKey: doc.employeeKey,
            employeeName: doc.employeeName || "ทีมงาน",
            title: "งานอีเวนต์ / งานใหญ่รายเดือน",
            progress: `ส่งแล้ว ${done} รายการ`,
            evidence: extractEvidence([data.evidence])
          });
        }
        for (const doc of stockDocs) {
          const data = (doc.data as { checked?: Record<string, unknown>; details?: Record<string, unknown>; status?: string }) ?? {};
          cards.push({
            id: `ms:${doc.employeeKey}`,
            scope: "monthly",
            scopeKey: stockKey,
            employeeKey: doc.employeeKey,
            employeeName: doc.employeeName || "ทีมงาน",
            title: "นับ Stock Single card รายเดือน",
            progress: `ติ๊กแล้ว ${countChecked(data.checked)} รายการ${data.status ? ` · ${data.status}` : ""}`,
            evidence: extractEvidence([data.details])
          });
        }
        setTeamCards(cards);
        mergeVerdicts([...evVerdicts, ...stVerdicts]);
      } else {
        const list = await fetchAssignmentsForDate(branch, workDate).catch(() => [] as WorkAssignment[]);
        if (!alive) return;
        setAssignments(
          list.filter((a) => a.status !== "open").sort((a, b) => a.staffCode.localeCompare(b.staffCode))
        );
      }
      if (alive) setLoaded(true);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [tab, workDate, branch, mergeVerdicts]);

  const findVerdict = (identity: VerdictIdentity) => verdicts[verdictKey(identity)];

  // ---- summary ------------------------------------------------------------
  const summary = useMemo(() => {
    if (tab === "assigned") {
      const submitted = assignments.length;
      const approved = assignments.filter((a) => a.status === "done").length;
      const needsFix = assignments.filter((a) => a.status === "needs_revision").length;
      const pending = assignments.filter((a) => a.status === "submitted").length;
      return { submitted, approved, needsFix, pending };
    }
    if (tab === "daily") {
      const submitted = daily.length;
      let approved = 0;
      let needsFix = 0;
      for (const person of daily) {
        const v = findVerdict({
          scope: "daily",
          scopeKey: dailyScopeKey(workDate),
          employeeKey: person.employeeKey,
          employeeName: person.employeeName,
          unitId: "all",
          unitLabel: "งานรายวัน"
        });
        if (v?.status === "approved") approved += 1;
        else if (v?.status === "needs_fix") needsFix += 1;
      }
      return { submitted, approved, needsFix, pending: submitted - approved - needsFix };
    }
    const submitted = teamCards.length;
    let approved = 0;
    let needsFix = 0;
    for (const card of teamCards) {
      const v = findVerdict({
        scope: card.scope,
        scopeKey: card.scopeKey,
        employeeKey: card.employeeKey,
        employeeName: card.employeeName,
        unitId: "all",
        unitLabel: card.title
      });
      if (v?.status === "approved") approved += 1;
      else if (v?.status === "needs_fix") needsFix += 1;
    }
    return { submitted, approved, needsFix, pending: submitted - approved - needsFix };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, daily, teamCards, assignments, verdicts, workDate]);

  return (
    <section className="mrev">
      <div className="mrev-summary">
        <label className="mrev-date">
          <span>วันที่ตรวจ</span>
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
        </label>
        <div className="mrev-stats">
          <div className="mrev-stat">
            <strong>{summary.submitted}</strong>
            <span>ส่งตรวจ</span>
          </div>
          <div className="mrev-stat mrev-stat--pending">
            <strong>{summary.pending}</strong>
            <span>รอตรวจ</span>
          </div>
          <div className="mrev-stat mrev-stat--fix">
            <strong>{summary.needsFix}</strong>
            <span>ให้แก้ไข</span>
          </div>
          <div className="mrev-stat mrev-stat--ok">
            <strong>{summary.approved}</strong>
            <span>อนุมัติแล้ว</span>
          </div>
        </div>
      </div>

      <div className="mrev-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className={`mrev-tab ${tab === entry.key ? "is-active" : ""}`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="empty-review">
          <strong>กำลังโหลดข้อมูล…</strong>
        </div>
      ) : tab === "daily" ? (
        <DailyList
          people={daily}
          workDate={workDate}
          presses={presses}
          findVerdict={findVerdict}
          onVerdictSaved={onVerdictSaved}
        />
      ) : tab === "assigned" ? (
        <AssignedList
          assignments={assignments}
          onChanged={(updated) =>
            setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
          }
        />
      ) : (
        <TeamList cards={teamCards} findVerdict={findVerdict} onVerdictSaved={onVerdictSaved} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Daily list
// ---------------------------------------------------------------------------

function DailyList({
  people,
  workDate,
  presses,
  findVerdict,
  onVerdictSaved
}: {
  people: DailyPerson[];
  workDate: string;
  presses: SubmitLogEntry[];
  findVerdict: (identity: VerdictIdentity) => ReviewVerdict | undefined;
  onVerdictSaved: (verdict: ReviewVerdict) => void;
}) {
  if (!people.length) {
    return (
      <div className="empty-review">
        <strong>ยังไม่มีงานรายวันที่ส่งตรวจของวันนี้</strong>
        <span>ให้พนักงานกด “ส่งงาน” ในหน้า Checklist หลังบันทึกงานแต่ละช่วง</span>
      </div>
    );
  }
  return (
    <div className="mrev-cards">
      {people.map((person) => {
        const identity: VerdictIdentity = {
          scope: "daily",
          scopeKey: dailyScopeKey(workDate),
          employeeKey: person.employeeKey,
          employeeName: person.employeeName,
          unitId: "all",
          unitLabel: "งานรายวัน"
        };
        const verdict = findVerdict(identity);
        const onTime = person.records.filter((r) => r.status === "submitted" && isWorkflowRecordOnTime(r)).length;
        const submittedCount = person.records.filter((r) => r.status === "submitted").length;
        return (
          <details key={person.employeeKey} className="mrev-card">
            <summary className="mrev-card__head">
              <div>
                <strong>{person.employeeName}</strong>
                <small>
                  ส่ง {submittedCount}/{person.records.length} ช่วง · ตรงเวลา {onTime} · {person.branch}
                </small>
              </div>
              <VerdictBadge verdict={verdict} />
            </summary>
            <div className="mrev-card__body">
              <ul className="mrev-phases">
                {person.records.map((record) => {
                  const missed = record.status === "missed";
                  return (
                    <li
                      key={record.phaseId}
                      className={`mrev-phase ${missed ? "workflow-status-red" : isWorkflowRecordOnTime(record) ? "workflow-status-green" : "workflow-status-orange"}`}
                    >
                      <span className="phase-icon">{missed ? "!" : isWorkflowRecordOnTime(record) ? "✓" : "!"}</span>
                      <div>
                        <strong>{record.phaseTitle}</strong>
                        <small>
                          เสร็จ {record.completed}/{record.total} ·{" "}
                          {missed
                            ? "เลยกำหนดแล้วยังไม่ส่ง"
                            : `ส่ง ${timeOfDay(record.submittedAt)} · ใช้เวลา ${Math.round(
                                elapsedSeconds(record.startedAt, record.submittedAt) / 60
                              )} นาที · ${isWorkflowRecordOnTime(record) ? "ตรงเวลา" : "ช้ากว่ากำหนด"}`}
                        </small>
                        {(() => {
                          const label = summarisePresses(
                            presses.filter(
                              (entry) =>
                                entry.employeeName === person.employeeName && entry.phaseId === record.phaseId
                            ),
                            pressTime
                          );
                          return label ? <small className="review-presses">{label}</small> : null;
                        })()}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mrev-section">
                <p className="mrev-section__title">หลักฐาน / รายละเอียดที่แนบ</p>
                <EvidenceView evidence={person.evidence} />
              </div>
              <VerdictControls identity={identity} verdict={verdict} onSaved={onVerdictSaved} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly / Monthly team list
// ---------------------------------------------------------------------------

function TeamList({
  cards,
  findVerdict,
  onVerdictSaved
}: {
  cards: TeamCard[];
  findVerdict: (identity: VerdictIdentity) => ReviewVerdict | undefined;
  onVerdictSaved: (verdict: ReviewVerdict) => void;
}) {
  if (!cards.length) {
    return (
      <div className="empty-review">
        <strong>ยังไม่มีงานที่ส่งตรวจในช่วงนี้</strong>
        <span>เลือกวันที่ให้อยู่ในสัปดาห์/เดือนที่พนักงานส่งงาน แล้วรายการจะขึ้นที่นี่</span>
      </div>
    );
  }
  return (
    <div className="mrev-cards">
      {cards.map((card) => {
        const identity: VerdictIdentity = {
          scope: card.scope,
          scopeKey: card.scopeKey,
          employeeKey: card.employeeKey,
          employeeName: card.employeeName,
          unitId: "all",
          unitLabel: card.title
        };
        const verdict = findVerdict(identity);
        return (
          <details key={card.id} className="mrev-card">
            <summary className="mrev-card__head">
              <div>
                <strong>{card.title}</strong>
                <small>
                  {card.employeeName} · {card.progress}
                </small>
              </div>
              <VerdictBadge verdict={verdict} />
            </summary>
            <div className="mrev-card__body">
              <div className="mrev-section">
                <p className="mrev-section__title">หลักฐาน / รายละเอียดที่แนบ</p>
                <EvidenceView evidence={card.evidence} />
              </div>
              <VerdictControls identity={identity} verdict={verdict} onSaved={onVerdictSaved} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assigned work list (native approve / request-fix loop)
// ---------------------------------------------------------------------------

const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; cls: string }> = {
  open: { label: "ยังไม่ส่ง", cls: "workflow-status-white" },
  submitted: { label: "ส่งแล้ว รอตรวจ", cls: "workflow-status-orange" },
  needs_revision: { label: "ให้แก้ไข", cls: "workflow-status-red" },
  done: { label: "รับงานแล้ว", cls: "workflow-status-green" }
};

function AssignedList({
  assignments,
  onChanged
}: {
  assignments: WorkAssignment[];
  onChanged: (assignment: WorkAssignment) => void;
}) {
  if (!assignments.length) {
    return (
      <div className="empty-review">
        <strong>ยังไม่มีงานที่มอบหมายส่งตรวจของวันนี้</strong>
        <span>งานที่มอบหมายให้พนักงานจะปรากฏที่นี่เมื่อพนักงานส่งงาน</span>
      </div>
    );
  }
  return (
    <div className="mrev-cards">
      {assignments.map((assignment) => (
        <AssignmentCard key={assignment.id} assignment={assignment} onChanged={onChanged} />
      ))}
    </div>
  );
}

function AssignmentCard({
  assignment,
  onChanged
}: {
  assignment: WorkAssignment;
  onChanged: (assignment: WorkAssignment) => void;
}) {
  const [note, setNote] = useState(assignment.revisionNote ?? "");
  const [busy, setBusy] = useState<"approve" | "fix" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = ASSIGNMENT_STATUS[assignment.status];
  const reviewable = assignment.status === "submitted";

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const now = new Date().toISOString();
      await acceptAssignment(assignment.id, now);
      onChanged({ ...assignment, status: "done", reviewedAt: now, doneAt: now });
    } catch (err) {
      setError(err instanceof Error ? err.message : "รับงานไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function requestFix() {
    if (!note.trim()) {
      setError("พิมพ์สิ่งที่ต้องแก้ก่อน");
      return;
    }
    setBusy("fix");
    setError(null);
    try {
      const now = new Date().toISOString();
      await requestAssignmentRevision(assignment.id, note.trim(), now);
      onChanged({ ...assignment, status: "needs_revision", revisionNote: note.trim(), reviewedAt: now });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งกลับไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const photos = (assignment.imageEvidence ?? []).filter(Boolean);

  return (
    <details className="mrev-card" open={reviewable}>
      <summary className="mrev-card__head">
        <div>
          <strong>{assignment.title}</strong>
          <small>
            {assignment.staffCode} · ส่ง {timeOfDay(assignment.submittedAt)}
          </small>
        </div>
        <em className={`mrev-badge ${meta.cls}`}>{meta.label}</em>
      </summary>
      <div className="mrev-card__body">
        {assignment.detail ? <p className="mrev-text">{assignment.detail}</p> : null}
        {assignment.expectedResult ? (
          <p className="mrev-muted">ผลที่ต้องได้: {assignment.expectedResult}</p>
        ) : null}
        {assignment.note ? (
          <div className="mrev-section">
            <p className="mrev-section__title">บันทึกจากพนักงาน</p>
            <p className="mrev-text">{assignment.note}</p>
          </div>
        ) : null}
        <div className="mrev-section">
          <p className="mrev-section__title">หลักฐาน</p>
          {photos.length ? (
            <div className="mrev-evidence__photos">
              {photos.map((url) =>
                isImageUrl(url) ? (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img className="evidence-input__preview" src={url} alt="หลักฐาน" loading="lazy" />
                  </a>
                ) : (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="mrev-link">
                    เปิดไฟล์แนบ
                  </a>
                )
              )}
            </div>
          ) : (
            <p className="mrev-muted">ไม่มีหลักฐานแนบมา</p>
          )}
        </div>
        {reviewable ? (
          <div className="mrev-verdict">
            <textarea
              className="mrev-verdict__input"
              placeholder="ข้อความถึงพนักงาน (จำเป็นเมื่อขอให้แก้ไข)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
            <div className="mrev-verdict__actions">
              <button type="button" className="mrev-btn mrev-btn--approve" disabled={busy !== null} onClick={approve}>
                {busy === "approve" ? "กำลังบันทึก…" : "รับงาน"}
              </button>
              <button type="button" className="mrev-btn mrev-btn--fix" disabled={busy !== null} onClick={requestFix}>
                {busy === "fix" ? "กำลังบันทึก…" : "ส่งกลับให้แก้"}
              </button>
            </div>
            {error ? <p className="mrev-error">{error}</p> : null}
          </div>
        ) : assignment.status === "needs_revision" && assignment.revisionNote ? (
          <p className="mrev-verdict__meta">ส่งกลับให้แก้: “{assignment.revisionNote}”</p>
        ) : assignment.status === "done" ? (
          <p className="mrev-verdict__meta">รับงานแล้ว · {timeOfDay(assignment.doneAt ?? assignment.reviewedAt)}</p>
        ) : null}
      </div>
    </details>
  );
}
