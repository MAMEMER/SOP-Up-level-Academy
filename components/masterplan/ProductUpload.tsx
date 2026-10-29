"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { mpApi } from "../../lib/masterplan-client.ts";
import { MAX_PRODUCTS_CSV_BYTES, csvFromZip, slimStorehubCsv } from "../../lib/masterplan-products.ts";

// "อัปโหลดไฟล์ StoreHub" on the ข้อมูลสินค้า page: pick the product export (.csv or the
// emailed .zip) → unzip + drop unused columns in the browser → /api/masterplan/products
// regenerates the doc and compares it with the previous upload.

export function ProductUpload({ hasDoc }: { hasDoc: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setDone(null);
    if (file.size > MAX_PRODUCTS_CSV_BYTES) {
      setError("ไฟล์ใหญ่เกินไป — ต้องเป็นไฟล์ Export สินค้าจาก StoreHub");
      return;
    }
    try {
      setBusy("กำลังอ่านไฟล์…");
      const isZip = /\.zip$/i.test(file.name);
      const raw = isZip ? await csvFromZip(new Uint8Array(await file.arrayBuffer())) : await file.text();
      setBusy("กำลังสรุปข้อมูล…");
      const res = await mpApi<{ version: number; items: number }>("products", "POST", { fileName: file.name.replace(/\.zip$/i, ""), csv: slimStorehubCsv(raw) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`อัปเดตแล้ว — ${res.data.items.toLocaleString("th-TH")} รายการ · เวอร์ชัน ${res.data.version}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่ได้");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mp-block">
      <label className={`mp-upload${busy ? " is-busy" : ""}`} aria-disabled={busy ? true : undefined}>
        <Upload size={16} aria-hidden="true" /> {busy ?? (hasDoc ? "อัปโหลดไฟล์ StoreHub ใหม่" : "อัปโหลดไฟล์ StoreHub")}
        <input
          type="file"
          accept=".csv,.zip,text/csv,application/zip"
          disabled={Boolean(busy)}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mp-meta">StoreHub → สินค้า → Export to CSV แล้วเลือกไฟล์ที่ได้จากอีเมล (.csv หรือ .zip) · ระบบสรุปใหม่ทั้งหน้าและเทียบกับครั้งก่อนให้</p>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mp-ok" role="status">
          {done}
        </p>
      ) : null}
    </div>
  );
}
