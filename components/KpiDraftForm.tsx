"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function KpiDraftForm({ storageKey, action, className, children }: { storageKey: string; action: (data: FormData) => void | Promise<void>; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    try {
      const values = JSON.parse(localStorage.getItem(storageKey) || "{}");
      for (const [name, value] of Object.entries(values)) {
        const field = ref.current?.elements.namedItem(name);
        if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) && typeof value === "string") field.value = value;
      }
    } catch { /* unavailable storage */ }
  }, [storageKey]);
  function persist() {
    if (!ref.current) return;
    const fields = Array.from(ref.current.elements).filter((item): item is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement);
    const values = Object.fromEntries(fields.filter((field) => field.name && field.type !== "hidden").map((field) => [field.name, field.value]));
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch { /* unavailable storage */ }
  }
  function reset() { try { localStorage.removeItem(storageKey); } catch { /* unavailable storage */ } ref.current?.reset(); }
  return <form ref={ref} action={action} className={className} onInput={persist} onChange={persist}>{children}<button type="button" className="kpi-entry-reset" onClick={reset}>ล้างแบบร่าง</button></form>;
}
