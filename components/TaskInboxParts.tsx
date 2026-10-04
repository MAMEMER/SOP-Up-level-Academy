"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, MessageSquareWarning, Send, TrendingUp } from "lucide-react";
import { displayNameFor } from "../lib/employee-directory.ts";
import { OUTCOME_LABEL, reviewEntriesFor } from "../lib/project-review.ts";
import {
  TASK_STATE_LABEL,
  countdownText,
  dueFor,
  progressBarPercent,
  progressText,
  taskState,
  taskTone,
  trackModeOf,
  TRACK_MODE_LABEL,
  type TaskTone
} from "../lib/task-inbox.ts";
import type { WorkProject } from "../lib/work-projects.ts";

// ชิ้นส่วนที่หน้าแจ้งเตือนงาน · แฟ้มงาน · หน้าตรวจงาน ใช้ร่วมกัน — หน้าตาเดียวกันทุกที่
// น้องกับเจ้าของจะได้เห็นงานชิ้นเดียวกันในรูปแบบเดียวกัน

const THAI_SHORT_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 2026-10-04 → 4 ต.ค. */
export function thaiDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return date;
  return `${d} ${THAI_SHORT_MONTHS[m - 1]}`;
}

/** ISO เวลา → "4 ต.ค. 14:05" เวลาไทย */
export function thaiDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const date = at.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const time = at.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  return `${thaiDate(date)} ${time}`;
}

/** เก็บร่างที่พิมพ์ไว้ในเครื่อง — ปิดจอ/เน็ตหลุดแล้วกลับมายังอยู่ ล้างเมื่อส่งสำเร็จ */
export function useDraft(key: string, initial = ""): [string, (value: string) => void, () => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) setValue(saved);
    } catch {
      /* โหมดส่วนตัว — ใช้แบบไม่เก็บร่าง */
    }
  }, [key]);
  const set = (next: string) => {
    setValue(next);
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const clear = () => set("");
  return [value, set, clear];
}

export function ToneDot({ tone }: { tone: TaskTone }) {
  return <span className={`ti-dot ti-dot--${tone}`} aria-hidden />;
}

/** ป้ายสถานะ + สี */
export function StateBadge({ project, assignee, today }: { project: WorkProject; assignee: string; today: string }) {
  const state = taskState(project, assignee);
  const tone = taskTone(project, assignee, today);
  return <span className={`ti-badge ti-badge--${tone}`}>{TASK_STATE_LABEL[state]}</span>;
}

/** วันครบกำหนด + นับถอยหลัง */
export function DueLine({ project, assignee, today }: { project: WorkProject; assignee: string; today: string }) {
  const due = dueFor(project, assignee);
  const text = countdownText(project, assignee, today);
  const urgent = due <= today;
  return (
    <p className={urgent ? "ti-due is-urgent" : "ti-due"}>
      <CalendarClock size={16} aria-hidden />
      <span>
        ส่งภายใน <strong>{thaiDate(due)}</strong>
      </span>
      <span className="ti-due__count">{text}</span>
    </p>
  );
}

/** ความคืบหน้าเป็นคำพูด + แถบ (เฉพาะงานที่มีเป้า) */
export function ProgressLine({ project, today }: { project: WorkProject; today: string }) {
  const percent = progressBarPercent(project);
  return (
    <div className="ti-progress">
      <p>
        <TrendingUp size={15} aria-hidden /> {TRACK_MODE_LABEL[trackModeOf(project)]} · {progressText(project, today)}
      </p>
      {percent !== null ? (
        <div className="ti-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function Thumbs({ urls }: { urls?: string[] }) {
  if (!urls || !urls.length) return null;
  return (
    <div className="ti-thumbs">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="รูปหลักฐาน" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** ผลตรวจล่าสุดจากเจ้าของ (ต้องแก้อะไร หักเท่าไร พร้อมรูป) */
export function OwnerFeedback({ project, assignee }: { project: WorkProject; assignee: string }) {
  const last = reviewEntriesFor(project, assignee).slice(-1)[0];
  if (!last) return null;
  const fix = last.outcome === "needs_fix";
  return (
    <div className={fix ? "ti-feedback is-fix" : "ti-feedback"}>
      <p className="ti-feedback__head">
        {fix ? <MessageSquareWarning size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
        <strong>{fix ? "เจ้าของให้แก้ไข" : `ผลตรวจ: ${OUTCOME_LABEL[last.outcome]}`}</strong>
        <span className={last.points < 0 ? "ti-pts is-neg" : "ti-pts"}>
          {last.points > 0 ? "+" : ""}
          {last.points} คะแนน
        </span>
      </p>
      {last.note ? <p className="ti-feedback__note">{last.note}</p> : null}
      {fix && last.revisedDue ? <p className="ti-feedback__meta">ส่งแก้ภายใน {thaiDate(last.revisedDue)}</p> : null}
      <Thumbs urls={last.images} />
      <p className="ti-feedback__meta">ตรวจโดย {last.confirmedByName || last.confirmedBy} · {thaiDateTime(last.confirmedAt)}</p>
    </div>
  );
}

type TimelineItem =
  | { kind: "update"; at: string; by: string; note: string; images?: string[]; amount?: number; percent?: number }
  | { kind: "submit"; at: string; by: string; note: string; images?: string[] }
  | { kind: "review"; at: string; by: string; note?: string; images?: string[]; label: string; points: number; assignee: string };

/** ทุกอย่างที่เกิดกับงานนี้เรียงตามเวลา: อัปเดตรายวัน · ส่งงานสมบูรณ์ · ผลตรวจ */
export function TaskTimeline({ project }: { project: WorkProject }) {
  const unit = project.unit || "";
  const mode = trackModeOf(project);
  const items: TimelineItem[] = [
    ...(project.progress || []).map((entry) => ({
      kind: "update" as const,
      at: entry.at,
      by: entry.by,
      note: entry.note,
      images: entry.images,
      amount: entry.amount,
      percent: mode === "percent" ? entry.percent : undefined
    })),
    ...(project.submissions || []).map((entry) => ({ kind: "submit" as const, at: entry.at, by: entry.by, note: entry.note, images: entry.images })),
    ...(project.reviews || []).map((entry) => ({
      kind: "review" as const,
      at: entry.confirmedAt,
      by: entry.confirmedByName || entry.confirmedBy,
      note: entry.note,
      images: entry.images,
      label: OUTCOME_LABEL[entry.outcome],
      points: entry.points,
      assignee: entry.assignee
    }))
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (!items.length) return <p className="ti-empty">ยังไม่มีการอัปเดต</p>;
  return (
    <ol className="ti-timeline">
      {items.map((item, index) => (
        <li key={`${item.kind}-${item.at}-${index}`} className={`ti-timeline__item is-${item.kind}`}>
          <p className="ti-timeline__head">
            {item.kind === "submit" ? <Send size={14} aria-hidden /> : null}
            <strong>
              {item.kind === "update"
                ? `อัปเดต · ${displayNameFor(item.by)}`
                : item.kind === "submit"
                  ? `ส่งงานสมบูรณ์ · ${displayNameFor(item.by)}`
                  : `ตรวจงาน ${displayNameFor(item.assignee)} · ${item.label}`}
            </strong>
            {item.kind === "update" && item.amount !== undefined ? <span className="ti-chip">+{item.amount.toLocaleString("th-TH")} {unit}</span> : null}
            {item.kind === "update" && item.percent !== undefined ? <span className="ti-chip">{item.percent}%</span> : null}
            {item.kind === "review" ? (
              <span className={item.points < 0 ? "ti-pts is-neg" : "ti-pts"}>
                {item.points > 0 ? "+" : ""}
                {item.points}
              </span>
            ) : null}
            <time>{thaiDateTime(item.at)}</time>
          </p>
          {item.note ? <p className="ti-timeline__note">{item.note}</p> : null}
          <Thumbs urls={item.images} />
        </li>
      ))}
    </ol>
  );
}
