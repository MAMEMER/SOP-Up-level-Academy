"use client";

import { useState } from "react";
import { isTeamSelected, toggleTeamSelection, type TeamOption } from "../lib/team-options.ts";
import { ANSWER_KINDS, ANSWER_KIND_LABEL, type AnswerKind } from "../lib/checklist-overrides.ts";
import { createProject } from "../lib/work-projects-store.ts";
import { MODE_LABEL, addDays, totalDays, validateProjectDraft, type TrackMode } from "../lib/work-projects.ts";
import { TRACK_MODES, TRACK_MODE_HINT, TRACK_MODE_LABEL, validateTrack } from "../lib/task-inbox.ts";

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
  parentId,
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
  /** สั่งเป็นงานย่อยของงานใหญ่นี้ */
  parentId?: string;
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
  const [trackMode, setTrackMode] = useState<TrackMode>("done");
  const [workDays, setWorkDays] = useState(5);
  const [targetAmount, setTargetAmount] = useState("");
  const [unit, setUnit] = useState("");
  // หลายคน + งานเดี่ยว → แยกเป็นงานของแต่ละคน (ส่ง/ตรวจ/ให้คะแนนแยกกัน)
  const [perPerson, setPerPerson] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    const draft = { title: title.trim(), startDate, endDate, assignees: selectedCodes };
    const invalid =
      validateProjectDraft(trackMode === "workdays" ? { ...draft, endDate: startDate } : draft) ||
      validateTrack({ trackMode, workDays, targetAmount: Number(targetAmount) });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const base = {
        branch,
        title: draft.title,
        detail: detail.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        startDate,
        // นับวันทำงาน: server คำนวณวันส่งจากตารางกะเอง
        endDate: trackMode === "workdays" ? startDate : endDate,
        mode,
        openTime: openTime || undefined,
        dueTime: dueTime || undefined,
        ...(answerKind === "tick" ? {} : { answer: { kind: answerKind } }),
        trackMode,
        ...(trackMode === "workdays" ? { workDays } : {}),
        ...(trackMode === "amount" ? { targetAmount: Number(targetAmount), unit: unit.trim() || undefined } : {}),
        ...(parentId ? { parentId } : {})
      };
      const split = mode === "single" && perPerson && selectedCodes.length > 1;
      if (split) {
        for (const code of selectedCodes) await createProject({ ...base, assignees: [code] });
      } else {
        await createProject({ ...base, assignees: selectedCodes });
      }
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
      <p className="assign-work__label">{parentId ? "เพิ่มงานย่อย" : "มอบหมายงาน (เดี่ยว / กลุ่ม)"}</p>
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
        <span className="assign-work__field-label">4. นับความคืบหน้าแบบไหน</span>
        <div className="assign-work__chips">
          {TRACK_MODES.filter((value) => value !== "percent").map((value) => (
            <button
              type="button"
              key={value}
              className={trackMode === value ? "assign-work__chip is-on" : "assign-work__chip"}
              onClick={() => {
                setTrackMode(value);
                if (value === "done") setEndDate(startDate);
              }}
            >
              {TRACK_MODE_LABEL[value]}
            </button>
          ))}
        </div>
        <p className="assign-work__hint-lead">{TRACK_MODE_HINT[trackMode]}</p>
        {trackMode === "workdays" ? (
          <div className="assign-work__due-row">
            <label>
              เริ่มวันที่
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              ให้เวลากี่วันทำงาน
              <input type="number" inputMode="numeric" min={1} max={60} value={workDays} onChange={(e) => setWorkDays(Number(e.target.value))} />
            </label>
            <span className="project-form__days">วันส่ง = วันทำงานที่ {workDays} ตามตารางกะของน้อง (นับเฉพาะวันที่เข้า)</span>
          </div>
        ) : null}
        {trackMode === "amount" ? (
          <div className="assign-work__due-row">
            <label>
              เป้าหมาย
              <input type="number" inputMode="numeric" min={1} value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="เช่น 3000" />
            </label>
            <label>
              หน่วย
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="เช่น ใบ / กล่อง" />
            </label>
          </div>
        ) : null}
      </div>

      {trackMode === "workdays" ? null : (
      <div className="assign-work__field">
        <span className="assign-work__field-label">5. ช่วงเวลา <span className="assign-work__req">*</span></span>
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
      )}

      <div className="assign-work__field">
        <span className="assign-work__field-label">{trackMode === "workdays" ? 5 : 6}. เดี่ยวหรือกลุ่ม · เวลา · วิธีส่งงาน</span>
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
        {mode === "single" && selectedCodes.length > 1 ? (
          <label className="assign-work__split">
            <input type="checkbox" checked={perPerson} onChange={(e) => setPerPerson(e.target.checked)} />
            แยกเป็นงานของแต่ละคน ({selectedCodes.length} งาน) — ส่งและตรวจแยกกัน
          </label>
        ) : null}
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
        {busy ? "กำลังมอบหมาย…" : `${parentId ? "เพิ่มงานย่อย" : "มอบหมายงาน"}${selectedCodes.length > 1 ? ` (${selectedCodes.length} คน)` : ""}`}
      </button>
    </section>
  );
}
