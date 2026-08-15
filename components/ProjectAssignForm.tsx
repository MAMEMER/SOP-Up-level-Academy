"use client";

import { useState } from "react";
import { isTeamSelected, toggleTeamSelection, type TeamOption } from "../lib/team-options.ts";
import { ANSWER_KINDS, ANSWER_KIND_LABEL, type AnswerKind } from "../lib/checklist-overrides.ts";
import { createProject } from "../lib/work-projects-store.ts";
import { MODE_LABEL, addDays, totalDays, validateProjectDraft } from "../lib/work-projects.ts";

export type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

// ฟอร์ม "มอบหมายงาน (เดี่ยว/กลุ่ม)" ตัวเดียวกันที่ใช้ทั้งหน้า /admin/projects และหน้าต่างที่เปิด
// จากปฏิทิน — ปฏิทินส่งวันที่ที่กดมาเป็นค่าเริ่มต้น ไม่ต้องมานั่งเลือกวันซ้ำ.
export function ProjectAssignForm({
  branch,
  staff,
  teams = [],
  defaultStartDate,
  defaultEndDate,
  contextNote,
  onCreated
}: {
  branch: string;
  staff: StaffOption[];
  teams?: TeamOption[];
  defaultStartDate: string;
  /** ไม่ส่ง = งานวันเดียว (จบวันเดียวกับที่เริ่ม) */
  defaultEndDate?: string;
  /** บริบทของวัน/กิจกรรมที่เลือกมา — โชว์ไว้บนฟอร์มให้เห็นว่าสั่งงานของวันไหน */
  contextNote?: string;
  onCreated?: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate ?? defaultStartDate);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [mode, setMode] = useState<"single" | "group">("single");
  const [openTime, setOpenTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [answerKind, setAnswerKind] = useState<AnswerKind>("tick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    const draft = { title: title.trim(), startDate, endDate, assignees: selectedCodes };
    const invalid = validateProjectDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createProject({
        branch,
        title: draft.title,
        detail: detail.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        startDate,
        endDate,
        assignees: selectedCodes,
        mode,
        openTime: openTime || undefined,
        dueTime: dueTime || undefined,
        ...(answerKind === "tick" ? {} : { answer: { kind: answerKind } })
      });
      setTitle("");
      setDetail("");
      setExpectedResult("");
      setSelectedCodes([]);
      await onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "มอบหมายงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const days = totalDays(startDate, endDate);

  return (
    <section className="assign-work__form soft-card">
      <p className="assign-work__label">มอบหมายงาน (เดี่ยว / กลุ่ม)</p>
      {contextNote ? <p className="assign-work__context">{contextNote}</p> : null}
      <p className="assign-work__hint-lead">
        บอก <strong>ทำอะไร · ใครทำ · วันไหนถึงวันไหน · ส่งงานแบบไหน</strong> — วันเดียวก็ได้ หลายวันก็ส่ง progress ทุกวัน
      </p>

      <div className="assign-work__field">
        <span className="assign-work__field-label">1. ผู้รับผิดชอบ <span className="assign-work__req">*</span> — เลือกได้หลายคน</span>
        <div className="assign-work__staff-pick">
          {teams.length > 0 ? (
            <div className="assign-work__team-pick">
              <span className="assign-work__pick-label">เลือกทั้งทีม</span>
              <div className="assign-work__chips">
                {teams.map((team) => {
                  const on = isTeamSelected(selectedCodes, team.memberCodes);
                  const empty = team.memberCodes.length === 0;
                  return (
                    <button
                      type="button"
                      key={team.key}
                      className={on ? "assign-work__chip assign-work__chip--team is-on" : "assign-work__chip assign-work__chip--team"}
                      onClick={() => setSelectedCodes((prev) => toggleTeamSelection(prev, team.memberCodes))}
                      disabled={empty}
                    >
                      {on ? "✓ " : ""}{team.label}{empty ? " (ยังไม่มีสมาชิก)" : ` (${team.memberCodes.length})`}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="assign-work__chips">
            {staff.map((person) => (
              <label key={person.code} className={selectedCodes.includes(person.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
                <input type="checkbox" checked={selectedCodes.includes(person.code)} onChange={() => toggleCode(person.code)} />
                {person.displayName} ({person.employmentType === "full_time" ? "Full" : "Part"})
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="assign-work__field">
        <span className="assign-work__field-label">2. ต้องทำอะไร <span className="assign-work__req">*</span></span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อโปรเจกต์ เช่น จัดร้านใหม่โซนการ์ดเดี่ยว" />
        <textarea
          className="assign-work__detail"
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="รายละเอียด/ขอบเขตงาน เช่น ย้ายตู้ 4 ตู้ · จัดการ์ดใหม่ตามชุด · ทำป้ายราคาใหม่"
        />
      </div>

      <div className="assign-work__field">
        <span className="assign-work__field-label">3. งานเสร็จหน้าตาเป็นยังไง</span>
        <textarea
          className="assign-work__detail"
          rows={2}
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          placeholder="เช่น ตู้ทุกตู้จัดครบ มีป้ายราคาทุกใบ ถ่ายรูปหน้าร้านส่ง 3 รูป"
        />
      </div>

      <div className="assign-work__field">
        <span className="assign-work__field-label">4. ช่วงเวลา <span className="assign-work__req">*</span></span>
        <div className="assign-work__due-row">
          <label>
            ตั้งแต่วันที่
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            ถึงวันที่
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <span className="project-form__days">
            รวม {days} วัน{days === 1 ? " (งานวันเดียว — ส่งครั้งเดียวจบ)" : ""}
          </span>
        </div>
        <div className="project-card__quick">
          <span>ปรับเร็วๆ</span>
          <button type="button" onClick={() => setEndDate(startDate)}>วันเดียว</button>
          <button type="button" onClick={() => setEndDate(addDays(startDate, 6))}>1 สัปดาห์</button>
          <button type="button" onClick={() => setEndDate(addDays(endDate, 1))}>+ 1 วัน</button>
        </div>
      </div>

      <div className="assign-work__field">
        <span className="assign-work__field-label">5. เดี่ยวหรือกลุ่ม · เวลา · วิธีส่งงาน</span>
        <div className="assign-work__chips">
          {(["single", "group"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? "assign-work__chip is-on" : "assign-work__chip"}
              onClick={() => setMode(value)}
            >
              {MODE_LABEL[value]}{value === "group" ? " (ใครในทีมส่งก็นับ)" : " (คนที่รับผิดชอบส่งเอง)"}
            </button>
          ))}
        </div>
        <div className="assign-work__due-row">
          <label>
            เริ่มส่งได้ตั้งแต่
            <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </label>
          <label>
            ต้องจบไม่เกิน
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </label>
          <label>
            ส่งงานแบบไหน
            <select value={answerKind} onChange={(e) => setAnswerKind(e.target.value as AnswerKind)}>
              {ANSWER_KINDS.map((kind) => (
                <option key={kind} value={kind}>{ANSWER_KIND_LABEL[kind]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <p className="project-progress-form__error">{error}</p> : null}
      <button
        type="button"
        className="primary-action"
        onClick={submit}
        disabled={busy || !title.trim() || selectedCodes.length === 0}
      >
        {busy ? "กำลังมอบหมาย…" : `มอบหมายงาน${selectedCodes.length > 1 ? ` (${selectedCodes.length} คน)` : ""}`}
      </button>
    </section>
  );
}
