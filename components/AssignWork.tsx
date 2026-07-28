"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase-client.ts";
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

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time" };

// Owner "มอบหมายงาน" page. Writes to Firestore work_assignments so the assigned
// staff sees it on their "วันนี้ของฉัน" dashboard immediately (closes the loop the
// old local-JSON assign flow left open). Owner picks staff + date + task.
export function AssignWork({
  branch,
  assignedBy,
  staff,
  defaultDate
}: {
  branch: string;
  assignedBy: string;
  staff: StaffOption[];
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(staff[0] ? [staff[0].code] : []);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
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
  // Same Firebase Storage pattern as staff evidence (INVARIANT #7): login-gated,
  // 5MB cap, timestamp+random path so URLs can't be guessed.
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
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `sop-assign-attachments/${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safe}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type });
      const url = await getDownloadURL(snap.ref);
      setAttachments((prev) => [...prev, url]);
    } catch {
      setUploadError("อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน");
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
          attachments: attachments.length ? attachments : undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          assignedBy,
          createdAtIso
        });
      }
      setTitle("");
      setDetail("");
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
        <div className="assign-work__row">
          <label>
            วันที่
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="assign-work__staff-pick">
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="งาน เช่น ส่งเสื้อให้ลูกค้าคุณ A" />
        <textarea
          className="assign-work__detail"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="กรอกรายละเอียดงาน เช่น ที่อยู่จัดส่ง / จำนวน / ขนาด / หมายเหตุ (ถ้ามี)"
          rows={4}
        />

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
                      {displayNameFor(row.staffCode)}
                      {row.detail ? ` · ${row.detail}` : ""}
                    </em>
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
