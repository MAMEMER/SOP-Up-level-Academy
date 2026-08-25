"use client";

import { useState } from "react";
import { uploadEvidenceImage } from "../lib/evidence-upload.ts";
import { downscaleImage } from "../lib/image-downscale.ts";

// Evidence input for the performance form: attach an image (uploaded via the server
// route /api/evidence-upload, which authorizes off the SOP session cookie — the local
// JSON store doesn't persist on Vercel, so the image lives in Storage and only its URL
// is saved) OR paste a link. Both feed one hidden input (name = the field the server
// action reads), so nothing changes server-side.
export function EvidenceImageInput({ name }: { name: string }) {
  const [value, setValue] = useState(""); // final stored string: uploaded URL or pasted link
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("ไฟล์ต้องเป็นรูปภาพ");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Shrink phone-camera photos before upload — keeps them under Vercel's request-body
      // limit and fast on mobile (bug ticket 0Fxe4Q9TTNTtD1BI6dq9).
      const prepared = await downscaleImage(file);
      if (prepared.size > 5 * 1024 * 1024) {
        setError("รูปต้องไม่เกิน 5MB");
        return;
      }
      const url = await uploadEvidenceImage(prepared);
      setValue(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  const isImageUrl = /^https?:\/\//.test(value);

  return (
    <div className="evidence-input">
      <input type="hidden" name={name} value={value} />
      <div className="evidence-input__row">
        <label className="evidence-input__file">
          {uploading ? "กำลังอัปโหลด…" : "แนบรูป"}
          <input type="file" accept="image/*" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <input
          className="evidence-input__link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="หรือวางลิงก์รูป/แชท"
        />
      </div>
      {isImageUrl ? <img className="evidence-input__preview" src={value} alt="หลักฐาน" /> : null}
      {error ? <span className="evidence-input__error">{error}</span> : null}
    </div>
  );
}
