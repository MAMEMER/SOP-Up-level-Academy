"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { uploadEvidenceImage } from "../lib/evidence-upload.ts";
import {
  acceptAssignment,
  assignWork,
  deleteAssignment,
  fetchAssignmentsForDate,
  requestAssignmentRevision,
  type WorkAssignment
} from "../lib/work-assignments-store.ts";
import { assignmentStatusClass, assignmentStatusLabel } from "../lib/assignment-view.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { isTeamSelected, toggleTeamSelection, type TeamOption } from "../lib/team-options.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

// Owner "มอบหมายงาน" page. Writes to Firestore work_assignments so the assigned
// staff sees it on their "วันนี้ของฉัน" dashboard immediately (closes the loop the
// old local-JSON assign flow left open). Owner picks staff + date + task.
export function AssignWork({
  branch,
  assignedBy,
  staff,
  teams = [],
  defaultDate
}: {
  branch: string;
  assignedBy: string;
  staff: StaffOption[];
  teams?: TeamOption[];
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(staff[0] ? [staff[0].code] : []);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [location, setLocation] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachLink, setAttachLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rows, setRows] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setRows(await fetchAssignmentsForDate(branch, date));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, date]);

  function toggleCode(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  // Owner attaches reference files (รูปสินค้า/ใบปะหน้า/สลิป) when handing out the task.
  // Uploads through /api/evidence-upload (service account, authorized by the SOP cookie) —
  // no client Firebase Auth, so a logged-in owner whose Firebase Auth session lapsed can
  // still upload (INVARIANT #7). 5MB cap + unguessable path enforced server-side.
  async function onAttachFile(file: File | undefined) {
    if (!file) return;
    const okType = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      setUploadError("ไฟล์ต้องเป็นรูปภาพ หรือ PDF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("ไฟล์ต้องไม่เกิน 5MB");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadEvidenceImage(file, "assign-attachment");
      setAttachments((prev) => [...prev, url]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  function addAttachLink() {
    const trimmed = attachLink.trim();
    if (!trimmed) return;
    setAttachments((prev) => [...prev, trimmed]);
    setAttachLink("");
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((u) => u !== url));
  }

  async function submit() {
    if (!title.trim() || selectedCodes.length === 0) return;
    setBusy(true);
    try {
      // One doc per selected staff so each person sees it on their own dashboard.
      // Same createdAt stamp keeps a team-assigned batch grouped/identifiable.
      const createdAtIso = new Date().toISOString();
      for (const staffCode of selectedCodes) {
        await assignWork({
          branch,
          workDate: date,
          staffCode,
          title: title.trim(),
          detail: detail.trim() || undefined,
          location: location.trim() || undefined,
          expectedResult: expectedResult.trim() || undefined,
          dueTime: dueTime.trim() || undefined,
          attachments: attachments.length ? attachments : undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          assignedBy,
          createdAtIso
        });
      }
      setTitle("");
      setDetail("");
      setLocation("");
      setExpectedResult("");
      setDueTime("");
      setTrackingNumber("");
      setAttachments([]);
      setAttachLink("");
      setUploadError(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const isImageUrl = (u: string) => /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)/i.test(u) || /firebasestorage/.test(u);

  async function accept(row: WorkAssignment) {
    if (row.status === "done") return;
    await acceptAssignment(row.id, new Date().toISOString());
    await reload();
  }

  async function bounce(row: WorkAssignment) {
    const note = window.prompt("บอก staff ว่าต้องแก้อะไร:");
    if (!note || !note.trim()) return;
    await requestAssignmentRevision(row.id, note.trim(), new Date().toISOString());
    await reload();
  }

  async function remove(id: string) {
    await deleteAssignment(id);
    await reload();
  }

  return (
    <div className="assign-work">
      <section className="assign-work__form soft-card">
        <p className="assign-work__label">มอบหมายงานใหม่</p>
        <p className="assign-work__hint-lead">
          กรอกให้ครบ 5 ข้อ พนักงานจะเข้าใจทันทีว่า <strong>หน้าที่ใคร · ต้องทำอะไร · ที่ไหน · ส่งผลลัพธ์แบบไหน · เสร็จเมื่อไหร่</strong>
        </p>

        {/* 1. หน้าที่ใคร — ผู้รับผิดชอบ */}
        <div className="assign-work__field">
          <span className="assign-work__field-label">1. ผู้รับผิดชอบ <span className="assign-work__req">*</span> — ใครรับผิดชอบงานนี้</span>
          <div className="assign-work__staff-pick">
            {teams.length > 0 ? (
              <div className="assign-work__team-pick">
                <span className="assign-work__pick-label">เลือกทั้งทีม (กดทีเดียว = เลือกทุกคนในทีม)</span>
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
                        title={empty ? "ยังไม่มีสมาชิกในทีมนี้ — เพิ่มพนักงานทีมนี้ก่อน" : `${team.memberCodes.length} คน`}
                      >
                        {on ? "✓ " : ""}{team.label}{empty ? " (ยังไม่มีสมาชิก)" : ` (${team.memberCodes.length})`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <span className="assign-work__pick-label">พนักงาน (เลือกได้หลายคน = มอบเป็นทีม)</span>
            <div className="assign-work__chips">
              {staff.map((s) => (
                <label key={s.code} className={selectedCodes.includes(s.code) ? "assign-work__chip is-on" : "assign-work__chip"}>
                  <input type="checkbox" checked={selectedCodes.includes(s.code)} onChange={() => toggleCode(s.code)} />
                  {s.displayName} ({s.employmentType === "full_time" ? "Full" : "Part"})
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 2. ต้องทำอะไร — ชื่องาน + รายละเอียด */}
        <div className="assign-work__field">
          <span className="assign-work__field-label">2. ต้องทำอะไร <span className="assign-work__req">*</span></span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่องานสั้นๆ เช่น ส่งเสื้อให้ลูกค้าคุณ A" />
          <textarea
            className="assign-work__detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="รายละเอียด/ขั้นตอน เช่น จำนวน / ขนาด / วิธีทำ / หมายเหตุ (ถ้ามี)"
            rows={3}
          />
        </div>

        {/* 3. ที่ไหน — สถานที่ */}
        <div className="assign-work__field">
          <span className="assign-work__field-label">3. ที่ไหน</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="สถานที่/โซน/ที่อยู่จัดส่ง เช่น หน้าร้าน · สโตร์ชั้น 2 · ส่งไปรษณีย์สาขาบางแค"
          />
        </div>

        {/* 4. ส่งผลลัพธ์แบบไหน — definition of done */}
        <div className="assign-work__field">
          <span className="assign-work__field-label">4. ส่งผลลัพธ์แบบไหน (งานเสร็จหน้าตาเป็นยังไง + ต้องแนบหลักฐานอะไร)</span>
          <textarea
            className="assign-work__detail"
            value={expectedResult}
            onChange={(e) => setExpectedResult(e.target.value)}
            placeholder="เช่น แพ็กเรียบร้อย + ถ่ายรูปกล่อง 1 รูป · ได้เลขพัสดุ · ตอบแชทลูกค้าแล้วแคปหน้าจอ"
            rows={2}
          />
        </div>

        {/* 5. เสร็จเมื่อไหร่ — กำหนดวัน + เวลา */}
        <div className="assign-work__field">
          <span className="assign-work__field-label">5. ต้องสำเร็จเมื่อไหร่ <span className="assign-work__req">*</span></span>
          <div className="assign-work__due-row">
            <label>
              วันที่
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              ภายในเวลา (ถ้ามี)
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </label>
          </div>
        </div>

        <label className="assign-work__tracking">
          เลขแทค / เลขพัสดุ ส่งสินค้า (ถ้ามี)
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="เช่น TH1234567890 หรือ เลข tracking ขนส่ง"
          />
        </label>

        <div className="assign-work__attach">
          <span className="assign-work__pick-label">เพิ่มไฟล์แนบ (รูป/PDF — สูงสุด 5MB, หรือวางลิงก์)</span>
          <div className="assign-work__attach-row">
            <label className="assign-work__attach-file">
              {uploading ? "กำลังอัปโหลด…" : "แนบไฟล์"}
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => onAttachFile(e.target.files?.[0])}
              />
            </label>
            <input
              className="assign-work__attach-link"
              value={attachLink}
              onChange={(e) => setAttachLink(e.target.value)}
              placeholder="หรือวางลิงก์ไฟล์/รูป"
            />
            <button type="button" className="btn-soft" onClick={addAttachLink} disabled={!attachLink.trim()}>
              เพิ่มลิงก์
            </button>
          </div>
          {uploadError ? <span className="evidence-input__error">{uploadError}</span> : null}
          {attachments.length > 0 ? (
            <ul className="assign-work__attach-list">
              {attachments.map((u) => (
                <li key={u}>
                  {isImageUrl(u) ? (
                    <img className="evidence-input__preview" src={u} alt="ไฟล์แนบ" />
                  ) : (
                    <a href={u} target="_blank" rel="noreferrer">{u}</a>
                  )}
                  <button type="button" className="assign-work__del" onClick={() => removeAttachment(u)}>ลบ</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button type="button" className="primary-action" onClick={submit} disabled={busy || uploading || !title.trim() || selectedCodes.length === 0}>
          มอบหมาย{selectedCodes.length > 1 ? ` (${selectedCodes.length} คน)` : ""}
        </button>
      </section>

      <section className="assign-work__list">
        <p className="assign-work__label">งานของวันที่ {date}</p>
        {loading ? (
          <p className="assign-work__empty">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="assign-work__empty">ยังไม่มีงานมอบหมายวันนี้</p>
        ) : (
          <ul>
            {rows.map((row) => {
              const submitted = row.status === "submitted" || row.status === "needs_revision";
              return (
                <li key={row.id} className={`assign-work__item assign-work__item--${row.status}`}>
                  <div className="assign-work__item-main">
                    <strong>{row.title}</strong>
                    <em>
                      👤 {displayNameFor(row.staffCode)}
                      {row.dueTime ? ` · ⏰ ภายใน ${row.dueTime}` : ""}
                    </em>
                    {row.detail ? <em>📝 {row.detail}</em> : null}
                    {row.location ? <em>📍 ที่ไหน: {row.location}</em> : null}
                    {row.expectedResult ? <em>✅ ผลลัพธ์: {row.expectedResult}</em> : null}
                    {row.trackingNumber ? <em>เลขแทค/พัสดุ: {row.trackingNumber}</em> : null}
                    {row.attachments?.length ? (
                      <em>
                        ไฟล์แนบ:{" "}
                        {row.attachments.map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer">ไฟล์{i + 1} </a>
                        ))}
                      </em>
                    ) : null}
                    <em className={assignmentStatusClass[row.status]}>สถานะ: {assignmentStatusLabel[row.status]}</em>
                    {row.note ? <em>สิ่งที่ทำ: {row.note}</em> : null}
                    {row.imageEvidence?.length ? (
                      <em>
                        หลักฐาน:{" "}
                        {row.imageEvidence.map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer">รูป{i + 1} </a>
                        ))}
                      </em>
                    ) : null}
                    <Link href={`/assigned-work/task/${encodeURIComponent(row.id)}`} className="assign-work__open">
                      เปิดดูรายละเอียด →
                    </Link>
                  </div>
                  <div className="assign-work__actions">
                    {row.status !== "done" ? (
                      <button type="button" className="assign-work__accept" onClick={() => accept(row)} title="รับงาน">
                        ✓ รับงาน
                      </button>
                    ) : null}
                    {submitted ? (
                      <button type="button" className="assign-work__revise" onClick={() => bounce(row)} title="ขอให้แก้">
                        ขอให้แก้
                      </button>
                    ) : null}
                    <button type="button" className="assign-work__del" onClick={() => remove(row.id)} aria-label="ลบ">
                      ลบ
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
