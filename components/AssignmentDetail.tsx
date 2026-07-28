"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase-client.ts";
import { displayNameFor } from "../lib/employee-directory.ts";
import { assignmentStatusClass, assignmentStatusLabel } from "../lib/assignment-view.ts";
import {
  acceptAssignment,
  fetchAssignmentById,
  requestAssignmentRevision,
  submitAssignment,
  type WorkAssignment
} from "../lib/work-assignments-store.ts";

function nowIso() {
  return new Date().toISOString();
}

// Staff-facing submit form + owner review controls for a single assignment.
// Access: the assigned staff member, or any owner (admin). Everyone else is blocked.
export function AssignmentDetail({
  id,
  isOwner,
  viewerCode
}: {
  id: string;
  isOwner: boolean;
  viewerCode: string | null;
}) {
  const [record, setRecord] = useState<WorkAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // staff submission form state
  const [note, setNote] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // owner review state
  const [revisionNote, setRevisionNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const found = await fetchAssignmentById(id);
      if (!found) {
        setNotFound(true);
      } else {
        setRecord(found);
        setNote(found.note ?? "");
        setImages(found.imageEvidence ?? []);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <main className="page">
        <p className="my-shift__loading">กำลังโหลด…</p>
      </main>
    );
  }

  if (notFound || !record) {
    return (
      <main className="page">
        <Link href="/my-view" className="back-link">← กลับ งานของฉัน</Link>
        <section className="staff-empty">
          <p>ไม่พบงานนี้ — อาจถูกลบไปแล้ว</p>
        </section>
      </main>
    );
  }

  const canAccess = isOwner || (viewerCode !== null && record.staffCode === viewerCode);
  if (!canAccess) {
    return (
      <main className="page">
        <Link href="/my-view" className="back-link">← กลับ งานของฉัน</Link>
        <section className="staff-empty">
          <p>งานนี้ไม่ได้มอบหมายให้บัญชีนี้</p>
        </section>
      </main>
    );
  }

  const actionable = record.status === "open" || record.status === "needs_revision";
  const hasEvidence = images.length > 0 || Boolean(link.trim());

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("ไฟล์ต้องเป็นรูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("รูปต้องไม่เกิน 5MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `sop-evidence/${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safe}`;
      const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type });
      const url = await getDownloadURL(snap.ref);
      setImages((prev) => [...prev, url]);
    } catch {
      setError("อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    const trimmed = link.trim();
    if (!trimmed) return;
    setImages((prev) => [...prev, trimmed]);
    setLink("");
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function onSubmit() {
    if (!hasEvidence) {
      setError("ต้องแนบหลักฐานอย่างน้อย 1 อย่าง (รูป หรือ ลิงก์) ก่อนส่งงาน");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const evidence = [...images, ...(link.trim() ? [link.trim()] : [])];
      await submitAssignment(record!.id, {
        note: note.trim(),
        imageEvidence: evidence,
        submittedAtIso: nowIso()
      });
      setSaved(true);
      await load();
    } catch {
      setError("ส่งงานไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    setBusy(true);
    try {
      await acceptAssignment(record!.id, nowIso());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onRequestRevision() {
    if (!revisionNote.trim()) {
      setError("ใส่รายละเอียดว่าต้องแก้อะไร");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestAssignmentRevision(record!.id, revisionNote.trim(), nowIso());
      setRevisionNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const isImageUrl = (u: string) => /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)/i.test(u) || /firebasestorage/.test(u);

  return (
    <main className="page">
      <Link href="/my-view" className="back-link">← กลับ งานของฉัน</Link>

      <section className="board-hero">
        <div>
          <p className="eyebrow">Assigned work</p>
          <h2>{record.title}</h2>
          <p>
            {displayNameFor(record.staffCode)} · กำหนด {record.workDate}
            {record.assignedBy ? ` · มอบโดย ${record.assignedBy}` : ""}
          </p>
        </div>
        <span className={`status-pill ${assignmentStatusClass[record.status]}`}>
          {assignmentStatusLabel[record.status]}
        </span>
      </section>

      {record.detail ? (
        <section className="assignment-detail__brief soft-card">
          <p className="assign-work__label">รายละเอียดงานจากเจ้าของร้าน</p>
          <p>{record.detail}</p>
        </section>
      ) : null}

      {record.status === "needs_revision" && record.revisionNote ? (
        <section className="assignment-detail__revision soft-card">
          <p className="assign-work__label">เจ้าของร้านขอให้แก้ไข</p>
          <p>{record.revisionNote}</p>
        </section>
      ) : null}

      {saved ? <p className="assignment-detail__ok">✓ ส่งงานเรียบร้อย รอเจ้าของร้านตรวจ</p> : null}

      <section className="performance-manual-input-grid">
        {/* Submit / edit — available to the assigned staff (and owner) while still actionable */}
        {actionable ? (
          <article className="performance-input-panel">
            <div>
              <p className="eyebrow">Submit work</p>
              <h3>{record.status === "needs_revision" ? "แก้ไขและส่งใหม่" : "ส่งงาน + แนบหลักฐาน"}</h3>
            </div>
            <div className="performance-input-form">
              <label className="wide">
                รายละเอียด / สิ่งที่ทำ
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น แพ็กเสื้อแล้ว ส่งรอบ 14:30 แจ้งลูกค้าแล้ว"
                  rows={4}
                />
              </label>

              <div className="evidence-input">
                <span className="assign-work__pick-label">หลักฐาน (จำเป็น — แนบรูป หรือ วางลิงก์)</span>
                <div className="evidence-input__row">
                  <label className="evidence-input__file">
                    {uploading ? "กำลังอัปโหลด…" : "แนบรูป"}
                    <input type="file" accept="image/*" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                  <input
                    className="evidence-input__link"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="หรือวางลิงก์รูป/แชท/สลิป"
                  />
                  <button type="button" className="btn-soft" onClick={addLink} disabled={!link.trim()}>
                    เพิ่มลิงก์
                  </button>
                </div>
                {images.length > 0 ? (
                  <ul className="assignment-detail__evidence">
                    {images.map((u) => (
                      <li key={u}>
                        {isImageUrl(u) ? (
                          <img className="evidence-input__preview" src={u} alt="หลักฐาน" />
                        ) : (
                          <a href={u} target="_blank" rel="noreferrer">{u}</a>
                        )}
                        <button type="button" className="assign-work__del" onClick={() => removeImage(u)}>ลบ</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {error ? <span className="evidence-input__error">{error}</span> : null}
              <button type="button" className="primary-action" onClick={onSubmit} disabled={busy || uploading || !hasEvidence}>
                {record.status === "needs_revision" ? "ส่งงานที่แก้แล้ว" : "ส่งงาน"}
              </button>
            </div>
          </article>
        ) : (
          <article className="performance-input-panel">
            <div>
              <p className="eyebrow">Submitted</p>
              <h3>งานที่ส่งแล้ว</h3>
            </div>
            <div className="performance-daily-records">
              <span>สถานะ: {assignmentStatusLabel[record.status]}</span>
              <span>รายละเอียด: {record.note || "-"}</span>
              {record.submittedAt ? <span>ส่งเมื่อ: {record.submittedAt}</span> : null}
              {record.imageEvidence?.length ? (
                <div className="assignment-detail__evidence-view">
                  {record.imageEvidence.map((u) =>
                    isImageUrl(u) ? (
                      <img key={u} className="evidence-input__preview" src={u} alt="หลักฐาน" />
                    ) : (
                      <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>
                    )
                  )}
                </div>
              ) : (
                <span>หลักฐาน: -</span>
              )}
            </div>
          </article>
        )}

        {/* Owner review controls */}
        {isOwner ? (
          <article className="performance-input-panel">
            <div>
              <p className="eyebrow">Owner review</p>
              <h3>ตรวจงาน</h3>
            </div>
            {record.status === "submitted" || record.status === "needs_revision" ? (
              <div className="performance-input-form">
                <p>งานที่ staff ส่งมา — รับงาน หรือส่งกลับให้แก้</p>
                <button type="button" className="primary-action" onClick={onAccept} disabled={busy}>
                  ✓ รับงาน (ผ่าน)
                </button>
                <label className="wide">
                  เหตุผลที่ขอให้แก้
                  <textarea
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="บอก staff ว่าต้องแก้อะไร"
                    rows={3}
                  />
                </label>
                <button type="button" className="btn-soft" onClick={onRequestRevision} disabled={busy || !revisionNote.trim()}>
                  ส่งกลับให้แก้
                </button>
              </div>
            ) : record.status === "done" ? (
              <p className="assignment-detail__ok">✓ รับงานแล้ว</p>
            ) : (
              <p>ยังไม่ได้ส่งงาน — รอ staff ส่งงานเข้ามาก่อน</p>
            )}
          </article>
        ) : null}
      </section>
    </main>
  );
}
