"use client";

import { useState } from "react";

// ปุ่มคัดลอกรายการของที่ต้องสั่ง — พนักงานเอาไปวางในแชทสั่งของได้เลย ไม่ต้องพิมพ์ใหม่
export function SuppliesCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Safari บนมือถือบางเวอร์ชันบล็อก clipboard API → ถอยไปใช้ textarea ชั่วคราว
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className="supply-alert-button" onClick={() => void copy()}>
      {copied ? "คัดลอกแล้ว" : "คัดลอกรายการ"}
    </button>
  );
}
