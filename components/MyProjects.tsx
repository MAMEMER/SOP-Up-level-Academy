"use client";

import { useCallback, useEffect, useState } from "react";
import { EvidencePhotosInput } from "./EvidencePhotosInput.tsx";
import { ProjectMeter } from "./ProjectMeter.tsx";
import { ProjectProgressList } from "./ProjectProgressList.tsx";
import { displayNameFor } from "../lib/employee-directory.ts";
import { addProjectProgress, deleteProjectProgress, fetchProjectsForStaff } from "../lib/work-projects-store.ts";
import {
  PROJECT_STATUS_LABEL,
  currentPercent,
  progressAuthorsOn,
  progressCount,
  sortProjects,
  teamNeedsProgressToday,
  totalDays,
  validateProgressInput,
  type WorkProject
} from "../lib/work-projects.ts";

// หน้าของคนทำ: โปรเจกต์ที่ได้รับมอบหมาย + ช่องอัปเดต progress.
// เพิ่ม progress ตอนไหนก็ได้ (หลายครั้งต่อวันได้ เผื่อเข้ามาทำนอกเวลา) แต่วันละครั้งเป็นอย่างน้อย —
// วันไหนยังไม่ลง จะมีแถบเตือนค้างอยู่บนการ์ดจนกว่าจะลง.
export function MyProjects({
  branch,
  staffCode,
  today,
  readOnly = false
}: {
  branch: string;
  staffCode: string | null;
  today: string;
  readOnly?: boolean;
}) {
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffCode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setProjects(sortProjects(await fetchProjectsForStaff(branch, staffCode)));
      setLoadError(null);
    } catch {
      // เดิมกลืน error แล้วโชว์ "ยังไม่มีงาน" — งานที่สั่งมาแล้วหายไปเงียบๆ แยกไม่ออกจาก "ไม่มีงานจริงๆ"
      setProjects([]);
      setLoadError("โหลดงานโปรเจกต์ไม่สำเร็จ — ลองรีเฟรชอีกครั้ง ถ้ายังไม่ขึ้นแจ้งแอดมิน");
    } finally {
      setLoading(false);
    }
  }, [branch, staffCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!staffCode) return <p className="assign-work__empty">บัญชีนี้ยังไม่ผูกกับรหัสพนักงาน — ยังไม่มีโปรเจกต์</p>;
  if (loading) return <p className="assign-work__empty">กำลังโหลด…</p>;
  if (loadError) return <p className="project-progress-form__error">{loadError}</p>;
  if (projects.length === 0) return <p className="assign-work__empty">ยังไม่มีงานแบบโปรเจกต์ที่มอบหมายให้คุณ</p>;

  return (
    <div className="project-list">
      {projects.map((project) => {
        const needsToday = teamNeedsProgressToday(project, today);
        const open = openId === project.id;
        return (
          <section key={project.id} className="project-card soft-card">
            <div className="project-card__head">
              <div>
                <strong>{project.title}</strong>
                <em>
                  {project.startDate} → {project.endDate} · รวม {totalDays(project.startDate, project.endDate)} วัน ·{" "}
                  {project.assignees.map(displayNameFor).join(", ")}
                </em>
              </div>
              <span className="project-card__status">{PROJECT_STATUS_LABEL[project.status]}</span>
            </div>

            {project.detail ? <p className="project-card__detail">{project.detail}</p> : null}
            {project.expectedResult ? <p className="project-card__detail">งานเสร็จคือ: {project.expectedResult}</p> : null}

            <ProjectMeter project={project} today={today} />

            {project.status === "active" ? (
              needsToday ? (
                <p className="project-card__nudge">
                  วันนี้ยังไม่มีใครอัปเดต — งานนี้ต้องมีคนส่ง progress อย่างน้อยวันละ 1 ครั้ง (ใครในทีมก็ได้)
                </p>
              ) : (
                <p className="project-card__done-today">
                  วันนี้อัปเดตแล้ว {progressCount(project, today)} ครั้ง · โดย{" "}
                  {progressAuthorsOn(project, today).map(displayNameFor).join(", ")} · ทำต่อแล้วส่งเพิ่มได้เรื่อยๆ
                </p>
              )
            ) : null}

            {project.status === "active" && !readOnly ? (
              <ProgressForm
                project={project}
                today={today}
                startPercent={currentPercent(project)}
                onSaved={load}
              />
            ) : null}

            <button type="button" className="project-card__toggle" onClick={() => setOpenId(open ? null : project.id)}>
              {open ? "ซ่อนความคืบหน้ารายวัน" : "ดูความคืบหน้ารายวัน"}
            </button>
            {open ? (
              <ProjectProgressList
                project={project}
                today={today}
                onDelete={
                  readOnly
                    ? undefined
                    : async (progressId) => {
                        await deleteProjectProgress(project.id, progressId);
                        await load();
                      }
                }
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ProgressForm({
  project,
  today,
  startPercent,
  onSaved
}: {
  project: WorkProject;
  today: string;
  startPercent: number;
  onSaved: () => Promise<void>;
}) {
  const [percent, setPercent] = useState(startPercent);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const invalid = validateProgressInput({ percent, note });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await addProjectProgress({
        id: project.id,
        date: today,
        percent,
        note: note.trim(),
        images: photos.split("\n").map((url) => url.trim()).filter(Boolean),
        link: link.trim() || undefined
      });
      setNote("");
      setPhotos("");
      setLink("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-progress-form">
      <p className="assign-work__label">ส่ง progress ของวันนี้</p>
      <p className="project-progress-form__rule">
        ใครในทีมส่งก็ได้ · อย่างน้อยวันละ 1 ครั้ง · ทำเพิ่มตอนไหนก็ส่งซ้ำได้จนกว่างานจะเสร็จ (100% = ปิดงาน)
      </p>
      <label className="project-progress-form__percent">
        ตอนนี้เสร็จไปแล้วกี่ % ({percent}%)
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
        />
      </label>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="วันนี้ทำอะไรไปบ้าง เช่น จัดของขึ้นชั้น 3 ตู้ · ถ่ายรูปสินค้าเสร็จ 20 รายการ"
      />
      {/* แนบรูปได้ทุกครั้งที่อัปเดต — เจ้าของจะได้เห็นหน้างานจริงของแต่ละครั้ง ไม่ใช่แค่ตัวเลข % */}
      <EvidencePhotosInput value={photos} onChange={setPhotos} label="แนบรูปหน้างาน (ถ้ามี)" />
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="ลิงก์งาน (ถ้ามี)" inputMode="url" />
      {error ? <p className="project-progress-form__error">{error}</p> : null}
      <button type="button" className="primary-action" onClick={submit} disabled={busy || !note.trim()}>
        {busy ? "กำลังส่ง…" : `ส่ง progress (${percent}%)`}
      </button>
    </div>
  );
}
