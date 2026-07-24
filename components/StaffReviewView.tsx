"use client";

import { useState } from "react";
import { MyShiftToday } from "./MyShiftToday.tsx";
import { ChecklistView } from "./ChecklistView.tsx";
import { cardStoreWorkflow } from "../lib/card-store-workflow.ts";

type StaffOption = { code: string; displayName: string; employmentType: "full_time" | "part_time"; email?: string };

// Owner review = "เข้าไปเหมือนกดตรงๆ": pick a staff member and render THEIR real
// interface (the same MyShiftToday + shift-filtered ChecklistView they see when they
// log in), so the owner reviews exactly what the staff sees. Remounts on staff/date
// change via the key so each view loads fresh from Firestore for that person.
export function StaffReviewView({
  branch,
  staff,
  defaultDate
}: {
  branch: string;
  staff: StaffOption[];
  defaultDate: string;
}) {
  const [staffCode, setStaffCode] = useState(staff[0]?.code ?? "");
  const [date, setDate] = useState(defaultDate);
  const selected = staff.find((s) => s.code === staffCode);

  return (
    <div className="staff-review">
      <div className="staff-review__controls">
        <label>
          พนักงาน
          <select value={staffCode} onChange={(e) => setStaffCode(e.target.value)}>
            {staff.map((s) => (
              <option key={s.code} value={s.code}>
                {s.displayName} ({s.employmentType === "full_time" ? "Full" : "Part"})
              </option>
            ))}
          </select>
        </label>
        <label>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {selected ? (
        <div className="staff-review__as" key={`${staffCode}:${date}`}>
          <p className="staff-review__as-note">กำลังดูมุมมองของ <strong>{selected.displayName}</strong> — เหมือนที่พนักงานเห็นเมื่อ login</p>
          <MyShiftToday staffCode={staffCode} branch={branch} workDate={date} />
          <ChecklistView
            phases={cardStoreWorkflow}
            userEmail={selected.email ?? `${staffCode.toLowerCase()}@review.local`}
            userRole="employee"
            staffCode={staffCode}
            branch={branch}
            workDate={date}
          />
        </div>
      ) : null}
    </div>
  );
}
