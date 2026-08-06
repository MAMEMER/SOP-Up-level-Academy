"use client";

import { useEffect, useMemo, useState } from "react";
import { type WorkflowPhase } from "./card-store-workflow.ts";
import { applyChecklistConfig, emptyChecklistConfig, type ChecklistConfig } from "./daily-checklist.ts";
import { fetchChecklistConfig } from "./daily-checklist-store.ts";
import { fetchShiftForStaffDate } from "./shift-schedule-store.ts";
import {
  resolveShiftPhaseView,
  rosterFromAssignment,
  type RosterState,
  type ShiftPhaseView
} from "./shift-phase-visibility.ts";

/**
 * The daily หัวข้อ a staffer should see today, filtered to the กะ they are rostered to work.
 * Mirrors ChecklistView: apply the owner config first (a หัวข้อ can be moved between กะ 1 /
 * กะ 2 / ทุกกะ), THEN the shift filter — filtering before the config would use the built-in
 * tags and ignore the owner's move.
 *
 * Returns not just the phase list but WHETHER today is an off day for this staffer, so the
 * dashboard can show the phases muted (reference only) instead of flagging them all late.
 *
 * - No staffCode (admin) → every phase, offDay=false (admins must see the whole board).
 * - Working (s1/s2) → only that shift's phases (a กะ2 staffer never sees เปิดร้าน).
 * - staffCode present but off / not rostered → every phase, offDay=true (never late).
 *
 * Fixes: a กะ2 staffer (e.g. Leo) saw เปิดร้าน — a กะ1-only หัวข้อ — flagged "เกินเวลา /
 * ยังไม่เสร็จ"; and a staffer on a day off saw the entire board flagged เลยเวลา.
 * (tickets bpFv3UQCXImuSOejAptz + วันหยุดเด้งเตือนผิด)
 */
export function useShiftPhases(
  phases: WorkflowPhase[],
  staffCode: string | null | undefined,
  branch: string | undefined,
  workDate: string
): ShiftPhaseView {
  // "neutral" = admin / still loading / fetch error → show all phases, not an off day.
  const [roster, setRoster] = useState<RosterState>("neutral");
  const [config, setConfig] = useState<ChecklistConfig>(emptyChecklistConfig);

  useEffect(() => {
    if (!staffCode || !branch) {
      setRoster("neutral");
      return;
    }
    let alive = true;
    setRoster("neutral");
    fetchShiftForStaffDate(branch, workDate, staffCode)
      .then((plan) => {
        if (!alive) return;
        setRoster(rosterFromAssignment(plan?.assignment));
      })
      // On error we do NOT claim it's an off day (that would hide real work) — stay neutral.
      .catch(() => alive && setRoster("neutral"));
    return () => {
      alive = false;
    };
  }, [staffCode, branch, workDate]);

  useEffect(() => {
    if (!branch) return;
    let alive = true;
    fetchChecklistConfig(branch)
      .then((data) => alive && setConfig(data))
      .catch(() => alive && setConfig(emptyChecklistConfig));
    return () => {
      alive = false;
    };
  }, [branch]);

  return useMemo(() => {
    const configured = applyChecklistConfig(phases, config);
    return resolveShiftPhaseView(configured, roster);
  }, [phases, roster, config]);
}
