"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, ListTodo } from "lucide-react";
import { memberName } from "../../lib/masterplan-access.ts";
import { mpApi } from "../../lib/masterplan-client.ts";
import { thaiDateTime } from "../../lib/masterplan-format.ts";
import type { KpiNextStep } from "../../lib/masterplan-kpi.ts";

// The next-steps checklist of a KPI. Any member can tick a step (stored with who/when) and
// turn it into an mp_tasks item ("สร้างเป็นงาน" — idempotent: a step already linked shows
// its task code instead of the button).

export type StepItem = { code: string; name?: string; step: KpiNextStep };

export function KpiSteps({
  items,
  showKpi = false,
  hideWho = false,
  emptyText = "ไม่มีสิ่งที่ต้องทำต่อ"
}: {
  items: StepItem[];
  showKpi?: boolean;
  /** the list is already grouped under a who heading */
  hideWho?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="mp-empty">{emptyText}</p>;
  return (
    <ul className="mp-ksteps">
      {items.map((item) => (
        <StepRow key={`${item.code}-${item.step.id}`} item={item} showKpi={showKpi} hideWho={hideWho} />
      ))}
    </ul>
  );
}

function StepRow({ item, showKpi, hideWho }: { item: StepItem; showKpi: boolean; hideWho: boolean }) {
  const router = useRouter();
  const { code, step } = item;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(step.done));
  const [taskCode, setTaskCode] = useState(step.taskCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputId = `step-${code}-${step.id}`;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setDone(next);
    const res = await mpApi("kpis", "PATCH", { code, action: "step", stepId: step.id, done: next });
    setBusy(false);
    if (!res.ok) {
      setDone(!next);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function makeTask() {
    setBusy(true);
    setError(null);
    const res = await mpApi<{ taskCode: string; created: boolean }>("kpis", "PATCH", { code, action: "task", stepId: step.id });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTaskCode(res.data.taskCode);
    router.refresh();
  }

  return (
    <li className={`mp-kstep${done ? " is-done" : ""}`}>
      <div className="mp-kstep__main">
        <input id={inputId} type="checkbox" checked={done} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <label htmlFor={inputId} className="mp-kstep__text">
          <span className="mp-kstep__action">{step.action}</span>
          <span className="mp-kstep__meta">
            {showKpi ? (
              <>
                <Link href={`/masterplan/kpis/${encodeURIComponent(code)}`} className="mp-code" onClick={(e) => e.stopPropagation()}>
                  {code}
                </Link>{" "}
                {item.name ? <span className="mp-kstep__kpi">{item.name}</span> : null}
                {" · "}
              </>
            ) : null}
            {hideWho ? "" : `${step.who || "ยังไม่ระบุคน"} · `}ขนาด {step.effort}
            {done && step.doneBy ? ` · ทำแล้วโดย ${memberName(step.doneBy)} ${thaiDateTime(step.doneAt)}` : ""}
          </span>
        </label>
      </div>
      <div className="mp-kstep__tools">
        {taskCode ? (
          <Link href="/masterplan/tasks" className="mp-tool">
            <ListTodo size={15} aria-hidden="true" /> งาน {taskCode}
          </Link>
        ) : (
          <button type="button" className="mp-tool mp-tool--strong" disabled={busy} onClick={() => void makeTask()}>
            <ListPlus size={15} aria-hidden="true" /> สร้างเป็นงาน
          </button>
        )}
      </div>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
