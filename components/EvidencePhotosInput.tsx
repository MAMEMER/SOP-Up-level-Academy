"use client";

import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase-client.ts";

// Multi-photo evidence uploader (สูงสุด 3 รูป). อัปโหลดแต่ละรูปขึ้น Firebase Storage
// (bucket + path scheme เดียวกับ EvidenceImageInput) แล้วเก็บ URL ทั้งหมดเป็น string
// คั่นด้วยขึ้นบรรทัดใหม่ ผ่าน value/onChange ให้ parent บันทึกเป็น detail string เดียว
// (ไม่ต้องแก้ฝั่ง server). ต้อง Google login, เช็ค image/ client-side, cap 5MB/รูป —
// ตามข้อกำหนด evidence เดียวกับ EvidenceImageInput.
const DEFAULT_MAX_PHOTOS = 3;

export function EvidencePhotosInput({
  value,
  onChange,
  disabled = false,
  max = DEFAULT_MAX_PHOTOS,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  max?: number;
  label?: string;
}) {
  const urls = value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function commit(next: string[]) {
    onChange(next.slice(0, max).join("\n"));
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = max - urls.length;
    if (remaining <= 0) {
      setError(`แนบได้สูงสุด ${max} รูป`);
      return;
    }
    const picked = Array.from(fileList).slice(0, remaining);
    setError(null);
    setUploading(true);
    try {
      const uploaded: string[] = [];
      let skipped = false;
      for (const file of picked) {
        if (!file.type.startsWith("image/")) {
          setError("ไฟล์ต้องเป็นรูปภาพ");
          skipped = true;
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setError("รูปต้องไม่เกิน 5MB");
          skipped = true;
          continue;
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `sop-evidence/${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safe}`;
        const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type });
        uploaded.push(await getDownloadURL(snap.ref));
      }
      if (uploaded.length) commit([...urls, ...uploaded]);
      if (fileList.length > remaining && !skipped) {
        setError(`แนบได้สูงสุด ${max} รูป`);
      }
    } catch {
      setError("อัปโหลดไม่สำเร็จ — ต้อง login Google ก่อน");
    } finally {
      setUploading(false);
    }
  }

  function removeAt(index: number) {
    commit(urls.filter((_, i) => i !== index));
  }

  const full = urls.length >= max;
  const fileLabel = uploading
    ? "กำลังอัปโหลด…"
    : full
      ? `ครบ ${max} รูปแล้ว`
      : label ?? `แนบรูป (สูงสุด ${max} รูป)`;

  return (
    <div className="evidence-input">
      <div className="evidence-input__row">
        <label className="evidence-input__file">
          {fileLabel}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || uploading || full}
            onChange={(event) => {
              void onFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <span className="evidence-input__count">{urls.length}/{max} รูป</span>
      </div>
      {urls.length ? (
        <div className="evidence-input__gallery">
          {urls.map((url, index) => (
            <div key={url} className="evidence-input__thumb">
              <img className="evidence-input__preview" src={url} alt={`หลักฐาน ${index + 1}`} />
              {!disabled ? (
                <button
                  type="button"
                  className="evidence-input__remove"
                  onClick={() => removeAt(index)}
                  aria-label={`ลบรูปที่ ${index + 1}`}
                >
                  ลบ
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <span className="evidence-input__error">{error}</span> : null}
    </div>
  );
}
