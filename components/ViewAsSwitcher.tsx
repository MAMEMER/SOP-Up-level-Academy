"use client";

import { useState } from "react";

// Owner tool: step into a staff account to verify what that person actually sees —
// their shift, their assigned work, their checklist state, their score. Read-only.

export function ViewAsSwitcher({
  staff
}: {
  staff: Array<{ email: string; displayName: string }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function viewAs(email: string) {
    setBusy(email);
    setError("");
    try {
      const res = await fetch("/api/auth/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error(String(res.status));
      // Full reload so every server component re-renders under the new identity.
      window.location.href = "/";
    } catch {
      setError("สลับมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusy(null);
    }
  }

  return (
    <section className="workflow-panel">
      <div className="section-heading">
        <p className="eyebrow">view as</p>
        <h2>เข้าดูแทนพนักงาน</h2>
        <p>กดชื่อเพื่อเข้าเว็บในมุมมองของคนนั้น เห็นข้อมูลจริงทุกหน้า แต่แก้ไขหรือส่งงานแทนไม่ได้</p>
      </div>
      <div className="view-as-list">
        {staff.map((person) => (
          <button
            key={person.email}
            type="button"
            className="soft-button"
            disabled={busy !== null || !person.email}
            onClick={() => viewAs(person.email)}
          >
            {busy === person.email ? "กำลังสลับ…" : `ดูในมุมมองของ ${person.displayName}`}
          </button>
        ))}
      </div>
      {error ? <p className="phase-warning">{error}</p> : null}
    </section>
  );
}
