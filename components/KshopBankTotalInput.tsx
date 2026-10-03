"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// ช่องให้เจ้าของใส่ "ยอดเงิน" จากเมลสรุปยอดประจำวันของ K SHOP (KPLUSSHOP@kasikornbank.com)
export function KshopBankTotalInput({ workDate, initial }: { workDate: string; initial: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "bankTotal", date: workDate, amount: Number(value.replace(/,/g, "")) })
      });
      if (!res.ok) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="close-bank">
      <label className="close-field">
        <span>ยอดที่ธนาคารสรุปของวันนี้ (จากเมล K SHOP)</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="เช่น 37,137.92"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" className="primary-action" disabled={busy || !value.trim()} onClick={save}>
        {busy ? "กำลังบันทึก…" : "บันทึกยอดธนาคาร"}
      </button>
      {error ? <p className="close-message is-bad">{error}</p> : null}
    </div>
  );
}
