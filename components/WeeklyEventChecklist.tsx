"use client";

import { useEffect, useMemo, useState } from "react";
import { canPersistWorkflowRecords } from "../lib/workflow-records.ts";
import {
  bangkokDateKey,
  weeklyEventTasks,
  weeklyTaskOccurrences,
  weeklyTaskStatusText,
  type WeeklyTaskOccurrence
} from "../lib/weekly-event-tasks.ts";
import {
  persistWeeklyEventDone,
  persistWeeklyEventEvidence,
  readWeeklyEventDoneKeys,
  readWeeklyEventEvidence
} from "../lib/weekly-event-store.ts";

const statusPillClass: Record<WeeklyTaskOccurrence["status"], string> = {
  waiting: "weekly-pill-waiting",
  not_started: "weekly-pill-pending",
  done: "weekly-pill-done",
  overdue: "weekly-pill-overdue"
};

export function WeeklyEventChecklist({ canManage = false }: { canManage?: boolean }) {
  const [occurrences, setOccurrences] = useState<WeeklyTaskOccurrence[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const trialMode = !canPersistWorkflowRecords();

  useEffect(() => {
    const now = new Date();
    const todayKey = bangkokDateKey(now);
    const doneKeys = readWeeklyEventDoneKeys();
    setDone(doneKeys);
    setEvidence(readWeeklyEventEvidence());
    setOccurrences(weeklyTaskOccurrences(todayKey, doneKeys, undefined, now));
  }, []);

  const total = occurrences.length;
  const completed = useMemo(
    () => occurrences.filter((occurrence) => done.has(occurrence.key)).length,
    [occurrences, done]
  );
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  function recomputeStatuses(nextDone: Set<string>) {
    const now = new Date();
    const todayKey = bangkokDateKey(now);
    setOccurrences(weeklyTaskOccurrences(todayKey, nextDone, undefined, now));
  }

  function toggleDone(key: string) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistWeeklyEventDone(next);
      recomputeStatuses(next);
      return next;
    });
  }

  function updateEvidence(key: string, value: string) {
    setEvidence((current) => {
      const next = { ...current, [key]: value };
      persistWeeklyEventEvidence(next);
      return next;
    });
  }

  // จัดกลุ่มตาม task ตามลำดับที่ประกาศไว้ เพื่อให้ anchor #taskId ทำงาน
  const groups = weeklyEventTasks
    .map((task) => ({
      task,
      items: occurrences.filter((occurrence) => occurrence.taskId === task.id)
    }))
    .filter((group) => group.items.length > 0);

  return (
    <section className="workflow-panel">
      {trialMode ? (
        <div className="trial-banner">
          <strong>โหมดทดลองใช้งาน</strong>
          <span>ทดลองติ๊กและแนบหลักฐานได้ ข้อมูลจะยังไม่บันทึกเข้า review/dashboard จนกว่าจะเปิดใช้งานจริง</span>
        </div>
      ) : null}

      {canManage ? (
        <div className="trial-banner">
          <strong>โหมดเจ้าของร้าน</strong>
          <span>
            ตรวจงาน ปลดล็อก และดูหลักฐานของทีมได้ ·{" "}
            <a href="/admin/performance-score" className="detail-inline-link">
              ไปหน้าคะแนน / KPI
            </a>
          </span>
        </div>
      ) : null}

      <div className="runner-status">
        <div>
          <span>ความคืบหน้างานประจำสัปดาห์ (รอบนี้)</span>
          <strong>{progress}%</strong>
        </div>
        <div>
          <span>ส่งแล้ว</span>
          <strong>{completed}/{total}</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="checklist-workflow">
        {groups.length ? (
          groups.map(({ task, items }) => (
            <section key={task.id} id={task.id} className="training-card phase-event">
              <div className="workflow-card-head">
                <span className="phase-icon">{task.game.slice(0, 2).toUpperCase()}</span>
                <div>
                  <p className="eyebrow">งานประจำสัปดาห์ · {task.game}</p>
                  <h3>{task.name}</h3>
                </div>
                <div className="workflow-card-meta">
                  <em>
                    {items.filter((item) => item.status === "done").length}/{items.length}
                  </em>
                </div>
              </div>
              <p className="phase-window">{task.note}</p>

              <div className="checklist-tick-list">
                {items.map((item) => (
                  <div key={item.key} className="tick-group has-detail">
                    <label className={done.has(item.key) ? "tick-row done" : "tick-row"}>
                      <input
                        type="checkbox"
                        checked={done.has(item.key)}
                        onChange={() => toggleDone(item.key)}
                      />
                      <span>
                        {item.weekdayLabel} {item.dateKey} · รอบ {item.roundLabel}
                        <em className={`weekly-status-pill ${statusPillClass[item.status]}`}>
                          {weeklyTaskStatusText[item.status]}
                        </em>
                      </span>
                    </label>

                    <div className="detail-panel">
                      <div className="detail-panel-head">
                        <strong>หลักฐานการทำงาน</strong>
                        <small>
                          {canManage
                            ? "ตรวจหลักฐานที่ทีมส่ง หรือบันทึกหมายเหตุการตรวจงาน"
                            : "บันทึกสิ่งที่ทำและแนบรูปหลักฐานของรอบนี้"}
                        </small>
                      </div>
                      <label className="workflow-note-field compact">
                        <span>หมายเหตุ / สรุปงาน</span>
                        <textarea
                          value={evidence[item.key] || ""}
                          onChange={(event) => updateEvidence(item.key, event.target.value)}
                          placeholder="ตัวอย่าง: จัดกิจกรรมเสร็จ ผู้เข้าร่วม 8 คน แนบรูปหน้าร้าน"
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
          ))
        ) : (
          <section className="training-card phase-event">
            <div className="workflow-card-head">
              <div>
                <h3>ไม่มีงานประจำสัปดาห์ในรอบนี้</h3>
              </div>
            </div>
            <p className="phase-window">รอตามรอบกิจกรรมของสัปดาห์ถัดไป</p>
          </section>
        )}
      </div>
    </section>
  );
}
