"use client";

import { useEffect, useMemo, useState } from "react";
import { canPersistWorkflowRecords } from "../lib/workflow-records.ts";
import {
  bangkokMonthKey,
  monthlyCategoryLabel,
  monthlyTaskOccurrences,
  monthlyTaskPillClass,
  monthlyTaskStatusText,
  monthlyTasks,
  type MonthlyTaskCategory,
  type MonthlyTaskOccurrence,
  type MonthlyTaskState
} from "../lib/monthly-event-tasks.ts";
import {
  persistMonthlyEventEvidence,
  persistMonthlyEventStates,
  readMonthlyEventEvidence,
  readMonthlyEventStates
} from "../lib/monthly-event-store.ts";

// สถานะที่ staff บันทึกได้เอง (เจ้าของร้านเพิ่ม "เสร็จสิ้น" ได้หลังตรวจงาน)
const staffStates: { value: MonthlyTaskState; label: string }[] = [
  { value: "not_started", label: "ยังไม่เริ่ม" },
  { value: "in_progress", label: "กำลังทำ" },
  { value: "submitted", label: "ส่งตรวจแล้ว" }
];

const ownerExtraState: { value: MonthlyTaskState; label: string } = { value: "done", label: "เสร็จสิ้น" };

const categoryOrder: MonthlyTaskCategory[] = ["event", "stock"];

export function MonthlyEventChecklist({ canManage = false }: { canManage?: boolean }) {
  const [occurrences, setOccurrences] = useState<MonthlyTaskOccurrence[]>([]);
  const [states, setStates] = useState<Record<string, MonthlyTaskState>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [monthLabel, setMonthLabel] = useState<string>("");
  const trialMode = !canPersistWorkflowRecords();

  useEffect(() => {
    const now = new Date();
    const monthKey = bangkokMonthKey(now);
    const storedStates = readMonthlyEventStates();
    setStates(storedStates);
    setEvidence(readMonthlyEventEvidence());
    const list = monthlyTaskOccurrences(monthKey, storedStates, undefined, now);
    setOccurrences(list);
    setMonthLabel(list[0]?.monthLabel ?? "");
  }, []);

  const total = occurrences.length;
  const completed = useMemo(
    () => occurrences.filter((occurrence) => occurrence.status === "done").length,
    [occurrences]
  );
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const stateOptions = canManage ? [...staffStates, ownerExtraState] : staffStates;

  function recompute(nextStates: Record<string, MonthlyTaskState>) {
    const now = new Date();
    const monthKey = bangkokMonthKey(now);
    setOccurrences(monthlyTaskOccurrences(monthKey, nextStates, undefined, now));
  }

  function setState(key: string, value: MonthlyTaskState) {
    setStates((current) => {
      const next = { ...current, [key]: value };
      persistMonthlyEventStates(next);
      recompute(next);
      return next;
    });
  }

  function updateEvidence(key: string, value: string) {
    setEvidence((current) => {
      const next = { ...current, [key]: value };
      persistMonthlyEventEvidence(next);
      return next;
    });
  }

  // จัดกลุ่มตามหมวด (event ก่อน แล้ว stock) เพื่อให้อ่านง่ายและ anchor #taskId ทำงาน
  const groups = categoryOrder
    .map((category) => ({
      category,
      label: monthlyCategoryLabel(category),
      items: occurrences.filter((occurrence) => occurrence.category === category)
    }))
    .filter((group) => group.items.length > 0);

  // fallback ให้ layout ไม่ว่างระหว่าง hydrate (occurrences ยังไม่ถูกเซ็ต)
  const baseGroups = groups.length
    ? groups
    : categoryOrder
        .map((category) => ({
          category,
          label: monthlyCategoryLabel(category),
          items: monthlyTasks
            .filter((task) => task.category === category)
            .map((task) => ({
              key: task.id,
              taskId: task.id,
              name: task.name,
              category: task.category,
              categoryLabel: monthlyCategoryLabel(task.category),
              schedule: task.schedule,
              note: task.note,
              monthKey: "",
              monthLabel: "",
              deadlineKey: "",
              state: "not_started" as MonthlyTaskState,
              status: "not_started" as const
            }))
        }))
        .filter((group) => group.items.length > 0);

  return (
    <section className="workflow-panel">
      {trialMode ? (
        <div className="trial-banner">
          <strong>โหมดทดลองใช้งาน</strong>
          <span>ทดลองอัปเดตสถานะและแนบหลักฐานได้ ข้อมูลจะยังไม่บันทึกเข้า review/dashboard จนกว่าจะเปิดใช้งานจริง</span>
        </div>
      ) : null}

      {canManage ? (
        <div className="trial-banner">
          <strong>โหมดเจ้าของร้าน</strong>
          <span>
            มอบหมายงาน ตรวจงาน และปิดงานเป็น &quot;เสร็จสิ้น&quot; ได้ ·{" "}
            <a href="/monthly-summary" className="detail-inline-link">
              ไปหน้าสรุปประจำเดือน
            </a>
          </span>
        </div>
      ) : null}

      <div className="runner-status">
        <div>
          <span>ความคืบหน้างานประจำเดือน{monthLabel ? ` (${monthLabel})` : ""}</span>
          <strong>{progress}%</strong>
        </div>
        <div>
          <span>เสร็จสิ้น</span>
          <strong>{completed}/{total || monthlyTasks.length}</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-workflow">
        {baseGroups.map((group) => (
          <section key={group.category} id={`monthly-${group.category}`} className="training-card phase-event">
            <div className="workflow-card-head">
              <span className="phase-icon">{group.category === "event" ? "EV" : "ST"}</span>
              <div>
                <p className="eyebrow">งานประจำเดือน · {group.label}</p>
                <h3>{group.label}</h3>
              </div>
              <div className="workflow-card-meta">
                <em>
                  {group.items.filter((item) => item.status === "done").length}/{group.items.length}
                </em>
              </div>
            </div>

            <div className="checklist-tick-list">
              {group.items.map((item) => (
                <div key={item.key} id={item.taskId} className="tick-group has-detail">
                  <div className={item.status === "done" ? "tick-row done" : "tick-row"}>
                    <span>
                      {item.name}
                      <em className={`monthly-status-pill ${monthlyTaskPillClass[item.status]}`}>
                        {monthlyTaskStatusText[item.status]}
                      </em>
                    </span>
                  </div>

                  <div className="detail-panel">
                    <div className="detail-panel-head">
                      <strong>{item.schedule}</strong>
                      <small>
                        กำหนดส่ง: สิ้นเดือน{monthLabel ? ` ${monthLabel}` : ""} · {item.note}
                      </small>
                    </div>

                    <div className="monthly-state-buttons">
                      {stateOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={item.state === option.value ? "monthly-state-btn active" : "monthly-state-btn"}
                          onClick={() => setState(item.key, option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <label className="workflow-note-field compact">
                      <span>หมายเหตุ / สรุปงาน</span>
                      <textarea
                        value={evidence[item.key] || ""}
                        onChange={(event) => updateEvidence(item.key, event.target.value)}
                        placeholder="ตัวอย่าง: จัดบูธเสร็จ ยอดขาย 12,000 บาท แนบรูปหน้างาน"
                      />
                    </label>
                    <label className="detail-upload">
                      <span>อัปโหลดรูปหลักฐาน</span>
                      <input type="file" accept="image/*" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
