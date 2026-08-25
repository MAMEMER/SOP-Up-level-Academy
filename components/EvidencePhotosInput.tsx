"use client";

import { useEffect, useState } from "react";
import { uploadEvidenceImage } from "../lib/evidence-upload.ts";
import { downscaleImage } from "../lib/image-downscale.ts";

// Multi-photo evidence uploader (สูงสุด 3 รูป). อัปโหลดแต่ละรูปผ่าน server route
// /api/evidence-upload (authorize ด้วย SOP session cookie — ไม่พึ่ง Firebase Auth ฝั่ง
// client) แล้วเก็บ URL ทั้งหมดเป็น string คั่นด้วยขึ้นบรรทัดใหม่ ผ่าน value/onChange ให้
// parent บันทึกเป็น detail string เดียว (ไม่ต้องแก้ฝั่ง server). เช็ค image/ client-side,
// cap 5MB/รูป — ตามข้อกำหนด evidence เดียวกับ EvidenceImageInput.
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
  // แตะรูปเพื่อดูเต็มจอ — index ของรูปที่กำลังเปิดใน lightbox (null = ปิด)
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // ปิด lightbox ด้วยปุ่ม Esc + ล็อกการ scroll พื้นหลังตอนเปิด
  useEffect(() => {
    if (viewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewIndex(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewIndex]);

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
        // Shrink phone-camera photos client-side before upload — keeps them under Vercel's
        // request-body limit and fast on mobile data (bug ticket 0Fxe4Q9TTNTtD1BI6dq9).
        const prepared = await downscaleImage(file);
        if (prepared.size > 5 * 1024 * 1024) {
          setError("รูปต้องไม่เกิน 5MB");
          skipped = true;
          continue;
        }
        uploaded.push(await uploadEvidenceImage(prepared));
      }
      if (uploaded.length) commit([...urls, ...uploaded]);
      if (fileList.length > remaining && !skipped) {
        setError(`แนบได้สูงสุด ${max} รูป`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
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
              <button
                type="button"
                className="evidence-input__zoom"
                onClick={() => setViewIndex(index)}
                aria-label={`ดูรูปที่ ${index + 1} แบบเต็มจอ`}
              >
                <img className="evidence-input__preview" src={url} alt={`หลักฐาน ${index + 1}`} />
              </button>
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
      {viewIndex !== null && urls[viewIndex] ? (
        <div
          className="evidence-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`รูปหลักฐานที่ ${viewIndex + 1}`}
          onClick={() => setViewIndex(null)}
        >
          <button
            type="button"
            className="evidence-lightbox__close"
            onClick={() => setViewIndex(null)}
            aria-label="ปิด"
          >
            ✕
          </button>
          <img
            className="evidence-lightbox__img"
            src={urls[viewIndex]}
            alt={`หลักฐานที่ ${viewIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
