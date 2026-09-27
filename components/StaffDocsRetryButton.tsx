"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

// ปุ่มลองส่งเอกสารที่ค้างขึ้นไดรฟ์ใหม่ — ไม่ส่ง docId = ลองทุกคนที่ค้าง
export function StaffDocsRetryButton({ docId, label }: { docId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/staff-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docId ? { docId } : {})
      });
      const data = (await res.json().catch(() => null)) as { results?: Array<{ status: string; error?: string }>; error?: string } | null;
      if (!res.ok) setMessage(data?.error === "drive_bridge_not_configured" ? "ยังไม่ได้ตั้งค่าไดรฟ์" : "ลองใหม่ไม่สำเร็จ");
      else {
        const failed = (data?.results || []).filter((row) => row.status !== "on_drive");
        setMessage(failed.length ? `ยังไม่สำเร็จ: ${failed[0].error || failed[0].status}` : "ขึ้นไดรฟ์แล้ว");
      }
      router.refresh();
    } catch {
      setMessage("เชื่อมต่อไม่ได้ ลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="sdoc-retry">
      <button type="button" className="sdoc-btn-soft" onClick={retry} disabled={busy}>
        {busy ? <LoaderCircle className="sdoc-spin" size={18} aria-hidden /> : <RefreshCw size={18} aria-hidden />}
        {label || "ลองส่งขึ้นไดรฟ์ใหม่"}
      </button>
      {message ? <small>{message}</small> : null}
    </span>
  );
}
