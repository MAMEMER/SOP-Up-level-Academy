"use client";

import { useState } from "react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { answerNeedsInput, type ItemAnswer } from "../lib/checklist-overrides.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { PROGRESS_STEPS, statusLabel, type TaskProgressAction, type TaskProgressEntry } from "../lib/task-progress.ts";

// แผงลงงานของงานหนึ่งชิ้น — ใช้ทั้งหน้า "งานวันนี้" และแท็บงานประจำสัปดาห์/เดือน.
// งานที่ใช้เวลาไม่ได้มีแค่ "ทำแล้ว/ยังไม่ทำ": กดเริ่มทำ → อัพเดทเป็น % พร้อมโน้ต/รูป →
// ติดปัญหาได้ → กดเสร็จ. ทุกครั้งที่กดจะบันทึกว่าใครกด ตอนไหน เพื่อให้หัวหน้าเห็นว่างาน
// ค้างอยู่ตรงไหน ไม่ใช่เห็นแค่ช่องว่าง.

export type ProgressPayload = { percent?: number; note?: string; value?: string; photos?: string[] };

type FormMode = "update" | "stuck" | "finish";

export function TaskProgressPanel({
  entry,
  done,
  doneBy,
  doneAt,
  doneValue,
  donePhotos,
  answer,
  disabled = false,
  busy = false,
  onAction
}: {
  entry?: TaskProgressEntry;
  /** ส่งงานของวันนั้นแล้วหรือยัง (record เดิม) */
  done: boolean;
  doneBy?: string;
  doneAt?: string;
  doneValue?: string;
  donePhotos?: string[];
  /** ส่งงานแบบไหนตอนกดเสร็จ (ไม่ตั้ง = กดเสร็จได้เลย) */
  answer?: ItemAnswer;
  disabled?: boolean;
  busy?: boolean;
  onAction: (action: TaskProgressAction, payload?: ProgressPayload) => void;
}) {
  const [mode, setMode] = useState<FormMode | null>(null);
  const [percent, setPercent] = useState<number>(entry?.percent ?? 0);
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [photos, setPhotos] = useState("");

  const finished = done || entry?.status === "done";
  const stuck = entry?.status === "stuck";
  const needsInput = answerNeedsInput(answer);
  const photoUrls = photos.split("\n").map((url) => url.trim()).filter(Boolean);
  const shownPercent = finished ? 100 : entry?.percent ?? 0;

  function reset() {
    setMode(null);
    setNote("");
    setValue("");
    setPhotos("");
  }

  function openForm(next: FormMode) {
    setPercent(entry?.percent ?? 0);
    setNote(next === "stuck" ? entry?.blockedNote ?? "" : "");
    setMode(next);
  }

  function send(action: TaskProgressAction, payload?: ProgressPayload) {
    onAction(action, payload);
    reset();
  }

  function submitForm() {
    if (mode === "finish") {
      send("finish", {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(answer?.kind === "photo" ? { photos: photoUrls } : value.trim() ? { value: value.trim() } : {})
      });
      return;
    }
    if (mode === "stuck") {
      send("stuck", { percent, note: note.trim(), ...(photoUrls.length ? { photos: photoUrls } : {}) });
      return;
    }
    send("update", {
      percent,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(photoUrls.length ? { photos: photoUrls } : {})
    });
  }

  // กดเสร็จโดยไม่ต้องเปิดฟอร์ม เมื่องานนี้ไม่ได้สั่งให้กรอกอะไร
  function finish() {
    if (needsInput) openForm("finish");
    else send("finish");
  }

  const formBlocked =
    (mode === "stuck" && note.trim().length === 0) ||
    (mode === "finish" && needsInput && (answer?.kind === "photo" ? photoUrls.length === 0 : value.trim().length === 0));

  return (
    <div className={`task-progress${finished ? " task-progress--done" : stuck ? " task-progress--stuck" : ""}`}>
      <div className="task-progress__status">
        {/* แถบมีตัวเลขกำกับอยู่แล้ว ป้ายเลยบอกแค่สถานะ ไม่พูด % ซ้ำ */}
        <span className="task-progress__pill">{finished ? "เสร็จแล้ว" : stuck ? "ติดปัญหา" : entry ? "กำลังทำ" : "ยังไม่เริ่ม"}</span>
        {entry || finished ? (
          <>
            <span className="task-progress__bar" role="img" aria-label={statusLabel(entry, done)}>
              <span className="task-progress__bar-fill" style={{ width: `${shownPercent}%` }} />
            </span>
            <span className="task-progress__percent">{shownPercent}%</span>
          </>
        ) : null}
      </div>

      {stuck && entry?.blockedNote ? <p className="task-progress__blocked">ติดอยู่ที่: {entry.blockedNote}</p> : null}

      {!disabled ? (
        <div className="task-progress__actions">
          {!entry && !finished ? (
            <>
              <button type="button" className="task-progress__btn task-progress__btn--primary" onClick={() => send("start")} disabled={busy}>
                เริ่มทำ
              </button>
              <button type="button" className="task-progress__btn" onClick={finish} disabled={busy}>
                เสร็จเลย
              </button>
            </>
          ) : null}

          {entry && !finished ? (
            <>
              <button type="button" className="task-progress__btn" onClick={() => openForm("update")} disabled={busy}>
                อัพเดทความคืบหน้า
              </button>
              {stuck ? (
                <button type="button" className="task-progress__btn" onClick={() => send("resume")} disabled={busy}>
                  กลับมาทำต่อ
                </button>
              ) : (
                <button type="button" className="task-progress__btn" onClick={() => openForm("stuck")} disabled={busy}>
                  ติดปัญหา
                </button>
              )}
              <button type="button" className="task-progress__btn task-progress__btn--primary" onClick={finish} disabled={busy}>
                เสร็จแล้ว
              </button>
            </>
          ) : null}

          {finished ? (
            <button type="button" className="task-progress__btn" onClick={() => send("reopen")} disabled={busy}>
              ยังไม่เสร็จ · กลับไปแก้
            </button>
          ) : null}
        </div>
      ) : null}

      {mode ? (
        <div className="task-progress__form">
          {mode !== "finish" ? (
            <div className="task-progress__steps" role="group" aria-label="ทำไปแล้วกี่เปอร์เซ็นต์">
              {[0, ...PROGRESS_STEPS].map((step) => (
                <button
                  key={step}
                  type="button"
                  className={percent === step ? "task-progress__step is-on" : "task-progress__step"}
                  onClick={() => setPercent(step)}
                  aria-pressed={percent === step}
                >
                  {step}%
                </button>
              ))}
            </div>
          ) : null}

          {mode !== "finish" ? (
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(event) => setPercent(Number(event.target.value))}
              aria-label="เลื่อนปรับเปอร์เซ็นต์"
              className="task-progress__range"
            />
          ) : null}

          {/* งานที่เจ้าของสั่งให้กรอกอะไรตอนส่ง — ขอตอนกดเสร็จเท่านั้น */}
          {mode === "finish" && needsInput ? (
            answer?.kind === "photo" ? (
              <EvidencePhotosInput value={photos} onChange={setPhotos} disabled={busy} label={answer.placeholder || "แนบรูป"} />
            ) : answer?.kind === "choice" ? (
              <select value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} aria-label="เลือกคำตอบ">
                <option value="">{answer.placeholder || "เลือก…"}</option>
                {(answer.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={answer?.kind === "number" ? "number" : "text"}
                inputMode={answer?.kind === "number" ? "numeric" : answer?.kind === "link" ? "url" : undefined}
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
                placeholder={answer?.placeholder || "กรอกก่อนส่ง"}
                aria-label="คำตอบ"
              />
            )
          ) : null}

          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={400}
            disabled={busy}
            placeholder={
              mode === "stuck" ? "ติดอะไรอยู่ (ต้องกรอก)" : mode === "finish" ? "อยากบอกอะไรเพิ่ม (ไม่บังคับ)" : "ทำอะไรไปแล้วบ้าง (ไม่บังคับ)"
            }
            aria-label="โน้ต"
          />

          {mode !== "finish" ? (
            <EvidencePhotosInput value={photos} onChange={setPhotos} disabled={busy} label="แนบรูป (ไม่บังคับ)" />
          ) : null}

          <div className="task-progress__form-actions">
            <button type="button" className="task-progress__btn task-progress__btn--primary" onClick={submitForm} disabled={busy || formBlocked}>
              {mode === "stuck" ? "บันทึกว่าติดปัญหา" : mode === "finish" ? "ส่งงาน" : "บันทึกความคืบหน้า"}
            </button>
            <button type="button" className="task-progress__btn" onClick={reset} disabled={busy}>
              ยกเลิก
            </button>
          </div>
          {formBlocked && mode === "stuck" ? <small className="task-progress__hint">เขียนสั้นๆ ว่าติดอะไร เพื่อให้หัวหน้าช่วยได้</small> : null}
          {formBlocked && mode === "finish" ? <small className="task-progress__hint">กรอกก่อนถึงจะส่งได้</small> : null}
        </div>
      ) : null}

      {doneValue ? <p className="task-progress__answer">{doneValue}</p> : null}
      {donePhotos?.length ? (
        <p className="task-progress__photos">
          {donePhotos.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`หลักฐาน ${index + 1}`} loading="lazy" />
            </a>
          ))}
        </p>
      ) : null}

      {finished ? (
        <p className="task-progress__by">
          เสร็จโดย {displayNameFor(entry?.doneBy || doneBy || "")}
          {(entry?.doneAt || doneAt) ? ` · ${(entry?.doneAt || doneAt)!.slice(11, 16)} น.` : ""}
        </p>
      ) : entry ? (
        <p className="task-progress__by">
          {entry.startedBy === entry.updatedBy
            ? `${displayNameFor(entry.startedBy)} เริ่มไว้`
            : `${displayNameFor(entry.startedBy)} เริ่ม · ${displayNameFor(entry.updatedBy)} อัพเดทล่าสุด`}
          {entry.updatedAt ? ` · ${entry.updatedAt.slice(11, 16)} น.` : ""}
        </p>
      ) : null}

      {entry && entry.updates.length > 1 ? (
        <details className="task-progress__timeline">
          <summary>ดูความคืบหน้าทั้งหมด ({entry.updates.length})</summary>
          <ol>
            {[...entry.updates].reverse().map((update, index) => (
              <li key={`${update.at}-${index}`}>
                <strong>{updateLabel(update.kind)} {update.percent}%</strong>
                <span>
                  {displayNameFor(update.by)} · {update.at.slice(11, 16)} น.
                </span>
                {update.note ? <em>{update.note}</em> : null}
                {update.photos?.length ? (
                  <span className="task-progress__photos">
                    {update.photos.map((url, photoIndex) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`ความคืบหน้า ${photoIndex + 1}`} loading="lazy" />
                      </a>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function updateLabel(kind: TaskProgressEntry["updates"][number]["kind"]): string {
  switch (kind) {
    case "start":
      return "เริ่มทำ";
    case "stuck":
      return "ติดปัญหา";
    case "resume":
      return "กลับมาทำต่อ";
    case "finish":
      return "เสร็จ";
    case "reopen":
      return "เปิดงานใหม่";
    default:
      return "อัพเดท";
  }
}
