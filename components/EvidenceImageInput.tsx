"use client";

import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase-client.ts";

// Evidence input for the performance form: attach an image (uploaded to Firebase
// Storage — the local JSON store doesn't persist on Vercel, so the image lives in
// Storage and only its URL is saved) OR paste a link. Both feed one hidden input
// (name = the field the server action reads), so nothing changes server-side.
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
      setValue(url);
    } catch {
      setError("อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน");
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
