"use client";

import { useEffect, useMemo, useState } from "react";
import { phasesForShift, type WorkflowPhase } from "./card-store-workflow.ts";
import { applyChecklistConfig, emptyChecklistConfig, type ChecklistConfig } from "./daily-checklist.ts";
import { fetchChecklistConfig } from "./daily-checklist-store.ts";
import { fetchShiftForStaffDate } from "./shift-schedule-store.ts";
import type { ShiftCode } from "./shift-schedule.ts";

/**
 * The daily หัวข้อ a staffer should see today, filtered to the กะ they are rostered to work.
 * Mirrors ChecklistView: apply the owner config first (a หัวข้อ can be moved between กะ 1 /
 * กะ 2 / ทุกกะ), THEN the shift filter — filtering before the config would use the built-in
 * tags and ignore the owner's move.
 *
 * When there is no staffCode (admin) or no working shift today (off / leave / unrostered)
 * every phase is returned, so nothing is ever hidden by accident.
 *
 * Fixes: a กะ2 staffer (e.g. Leo) saw เปิดร้าน — a กะ1-only หัวข้อ — flagged "เกินเวลา /
 * ยังไม่เสร็จ" on the dashboard status cards, a false late/missed alert for work that was
 * never his. (ticket bpFv3UQCXImuSOejAptz)
 */
export function useShiftPhases(
  phases: WorkflowPhase[],
  staffCode: string | null | undefined,
  branch: string | undefined,
  workDate: string
): WorkflowPhase[] {
  const [shift, setShift] = useState<ShiftCode | null>(null);
  const [config, setConfig] = useState<ChecklistConfig>(emptyChecklistConfig);

  useEffect(() => {
    if (!staffCode || !branch) {
      setShift(null);
      return;
    }
    let alive = true;
    fetchShiftForStaffDate(branch, workDate, staffCode)
      .then((plan) => {
        if (!alive) return;
        setShift(plan?.assignment === "s1" || plan?.assignment === "s2" ? plan.assignment : null);
      })
      .catch(() => alive && setShift(null));
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
    return shift ? phasesForShift(configured, shift) : configured;
  }, [phases, shift, config]);
}
