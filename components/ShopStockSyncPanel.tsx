"use client";

import { useState } from "react";
import type { ShopSyncStatus } from "../lib/shop-sync-status.ts";

// "Sync สต็อกร้านออนไลน์ตอนนี้" — manual trigger for /api/storehub/sync-shop, next to the
// automatic nightly cron. Shows when it last ran so the owner knows the shop is up to date.

function formatWhen(ms: number | null): string {
  if (!ms) return "ยังไม่เคย sync";
  const d = new Date(ms + 7 * 3600 * 1000); // Bangkok
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return `${date} ${time} น.`;
}

export function ShopStockSyncPanel({ initialStatus }: { initialStatus: ShopSyncStatus | null }) {
  const [status, setStatus] = useState<ShopSyncStatus | null>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function syncNow() {
    setBusy(true);
    setMsg("กำลัง sync สต็อกจาก StoreHub…");
    try {
      const res = await fetch("/api/storehub/sync-shop", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`sync สำเร็จ · ${data.products} สินค้า · เปลี่ยนสต็อก ${data.changed} รายการ · ${data.durationSec} วิ`);
        setStatus({
          ok: true,
          products: data.products,
          changed: data.changed,
          durationSec: data.durationSec,
          finishedAtMs: Date.now(),
        });
      } else if (res.status === 503) {
        setMsg("StoreHub / Firebase ยังไม่ได้ตั้งค่า (env)");
      } else if (res.status === 403) {
        setMsg("ไม่มีสิทธิ์ (ต้องเป็นแอดมิน)");
      } else {
        setMsg(`sync ไม่สำเร็จ: ${data.detail || data.error || res.status}`);
      }
    } catch {
      setMsg("sync ไม่สำเร็จ (network)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-hub__tool" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <strong>สต็อกร้านออนไลน์ (StoreHub → shop)</strong>
      </div>
      <small>
        ปกติ sync อัตโนมัติทุกคืน (ก่อนเปิดร้าน + หลังปิดร้าน). กดปุ่มนี้เพื่อ sync เดี๋ยวนี้ ·{" "}
        {status
          ? status.ok
            ? `ล่าสุด ${formatWhen(status.finishedAtMs)}${
                typeof status.products === "number" ? ` · ${status.products} สินค้า` : ""
              }`
            : `ล่าสุดมีปัญหา (${formatWhen(status.finishedAtMs)})`
          : "ยังไม่เคย sync"}
      </small>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary-action"
          onClick={syncNow}
          disabled={busy}
          style={{ minHeight: 44 }}
        >
          {busy ? "กำลัง sync…" : "Sync ตอนนี้"}
        </button>
        {msg ? <small>{msg}</small> : null}
      </div>
    </div>
  );
}
