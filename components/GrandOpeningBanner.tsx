"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { initialOpeningItems, openingProgress, type OpeningItem } from "../lib/grand-opening-checklist.ts";
export function GrandOpeningBanner() {
  const [rows, setRows] = useState<OpeningItem[]>([]);
  const [mode, setMode] = useState("loading");
  useEffect(() => {
    const controller = new AbortController();
    let stream: EventSource | undefined;
    void fetch("/api/grand-opening-checklist", { cache: "no-store", signal: controller.signal }).then(res => { if (!res.ok) throw Error(); return res.json(); }).then(data => {
      if (controller.signal.aborted) return;
      setRows(data.rows || initialOpeningItems); setMode(data.mode);
      if (data.mode === "shared") {
        stream = new EventSource("/api/grand-opening-checklist?stream=1");
        stream.addEventListener("rows", event => { setRows(JSON.parse((event as MessageEvent).data).rows); setMode("shared"); });
        stream.onerror = () => setMode("offline");
        stream.addEventListener("unavailable", () => setMode("offline"));
      }
    }).catch(() => { if (!controller.signal.aborted) setMode("offline"); });
    return () => { controller.abort(); stream?.close(); };
  }, []);
  const progress = openingProgress(rows).overall;
  return <aside className="opening-announcement influencer-tracker" aria-label="เตรียมงาน Grand Opening"><strong>เตรียมงาน Grand Opening 17–18 ต.ค.</strong><span role="status">{mode === "loading" ? "กำลังโหลด" : `พร้อม ${progress.done}/${progress.total}${mode === "preview" ? " · ทดลอง" : mode === "offline" ? " · รอเชื่อมต่อ" : ""}`}</span><Link className="it-secondary soft-button" href="/grand-opening-checklist">เปิดเช็กลิสต์</Link></aside>;
}
