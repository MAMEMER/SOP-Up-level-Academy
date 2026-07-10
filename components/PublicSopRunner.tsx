"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checklistTaskKey,
  countCompletedTasks,
  findNextStep,
  isStepChecklistComplete,
  stepDurationMinutes
} from "../lib/sop-runner.ts";

export type PublicRunnerStep = {
  id: string;
  step_order: number;
  title: string;
  body: string;
  checklist_items?: string[];
  duration_minutes?: number | null;
};

type PublicSopRunnerProps = {
  steps: PublicRunnerStep[];
  tools: string[];
  assignmentId?: string;
};

function taskKey(stepId: string, index: number) {
  return checklistTaskKey(stepId, index);
}

function buildRunItems(steps: PublicRunnerStep[], checked: Record<string, boolean>) {
  return steps.flatMap((step) =>
    (step.checklist_items || []).map((label, index) => ({
      stepId: step.id,
      itemIndex: index,
      label,
      completed: Boolean(checked[taskKey(step.id, index)])
    }))
  );
}

export function PublicSopRunner({ steps, tools, assignmentId }: PublicSopRunnerProps) {
  const [activeStepId, setActiveStepId] = useState(steps[0]?.id || "");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const activeStep = steps.find((step) => step.id === activeStepId) || steps[0];
  const totalTasks = useMemo(
    () => steps.reduce((sum, step) => sum + (step.checklist_items?.length || 0), 0),
    [steps]
  );
  const completedTasks = countCompletedTasks(checked);
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const dueSeconds = steps.reduce((sum, step) => sum + stepDurationMinutes(step) * 60, 0);
  const activeStepReadyToSave = activeStep ? isStepChecklistComplete(activeStep, checked) : false;

  useEffect(() => {
    if (!assignmentId) return;
    void fetch("/api/task-runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, dueSeconds, totalChecklist: totalTasks })
    });
  }, [assignmentId, dueSeconds, totalTasks]);

  function toggleTask(stepId: string, index: number) {
    const key = taskKey(stepId, index);
    setChecked((current) => ({ ...current, [key]: !current[key] }));
  }

  async function saveStep(step: PublicRunnerStep) {
    if (!isStepChecklistComplete(step, checked)) return;

    const nextStep = findNextStep(steps, step);
    if (nextStep) {
      setActiveStepId(nextStep.id);
      return;
    }

    const completed = countCompletedTasks(checked);
    if (assignmentId) {
      await fetch("/api/task-runs/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          dueSeconds,
          completedChecklist: completed,
          totalChecklist: totalTasks,
          items: buildRunItems(steps, checked)
        })
      });
    }
    setSaved(true);
  }

  if (!activeStep) return null;

  return (
    <section className="runner-shell">
      <div className="runner-status">
        <div>
          <span>ความคืบหน้า</span>
          <strong>{progress}%</strong>
        </div>
        <div className="runner-clock-note">
          <span>เวลาเริ่มงาน</span>
          <strong>บันทึกจาก Clock in</strong>
        </div>
      </div>
      <div className="runner-progress" aria-label={`ความคืบหน้า ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="runner-layout">
        <aside className="runner-step-list" aria-label="เลือกขั้นตอน">
          {steps.map((step) => {
            const taskCount = step.checklist_items?.length || 0;
            const doneCount = (step.checklist_items || []).filter((_, index) => checked[taskKey(step.id, index)]).length;
            const isActive = step.id === activeStep.id;
            return (
              <button
                key={step.id}
                type="button"
                className={isActive ? "runner-step active" : "runner-step"}
                onClick={() => setActiveStepId(step.id)}
              >
                <span>{step.step_order}</span>
                <strong>{step.title}</strong>
                <em>{doneCount}/{taskCount}</em>
              </button>
            );
          })}
        </aside>

        <div className="runner-board">
          <div className="runner-current">
            <span>ขั้นตอน {activeStep.step_order}</span>
            <h2>{activeStep.title}</h2>
            <p>{activeStep.body}</p>
          </div>

          <div className="task-grid">
            {(activeStep.checklist_items || []).map((task, index) => {
              const key = taskKey(activeStep.id, index);
              return (
                <button
                  key={key}
                  type="button"
                  className={checked[key] ? "task-tile done" : "task-tile"}
                  onClick={() => toggleTask(activeStep.id, index)}
                >
                  <span>{checked[key] ? "✓" : ""}</span>
                  <strong>{task}</strong>
                </button>
              );
            })}
          </div>

          <div className="runner-actions">
            <button
              type="button"
              className="green-button"
              onClick={() => saveStep(activeStep)}
              disabled={!activeStepReadyToSave}
            >
              บันทึก
            </button>
            {saved ? <strong className="runner-saved">บันทึกแล้ว</strong> : null}
            <div>
              {tools.slice(0, 3).map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
