"use client";

import { useState } from "react";
import type { SopFormInput } from "../lib/validations.ts";

const emptyStep = { title: "", body: "", checklistItems: [] as string[] };

export function SopEditor({
  initialValue,
  onSubmit
}: {
  initialValue: SopFormInput;
  onSubmit: (value: SopFormInput) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  function updateField<K extends keyof SopFormInput>(key: K, fieldValue: SopFormInput[K]) {
    setValue((current) => ({ ...current, [key]: fieldValue }));
  }

  return (
    <form
      className="panel sop-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(value);
      }}
    >
      <label>ชื่อ SOP<input value={value.title} onChange={(event) => updateField("title", event.target.value)} /></label>
      <label>วัตถุประสงค์<textarea value={value.purpose} onChange={(event) => updateField("purpose", event.target.value)} /></label>
      <label>ใช้เมื่อไหร่<textarea value={value.whenToUse} onChange={(event) => updateField("whenToUse", event.target.value)} /></label>
      <label>ผู้รับผิดชอบ<input value={value.responsibleRole} onChange={(event) => updateField("responsibleRole", event.target.value)} /></label>
      <label>อุปกรณ์หรือเอกสารที่ต้องใช้<textarea value={value.requiredTools} onChange={(event) => updateField("requiredTools", event.target.value)} /></label>
      <label>ข้อควรระวัง<textarea value={value.precautions} onChange={(event) => updateField("precautions", event.target.value)} /></label>
      <label>ปัญหาที่พบบ่อย / วิธีแก้<textarea value={value.faq} onChange={(event) => updateField("faq", event.target.value)} /></label>
      <section>
        <h3>ขั้นตอนการทำงาน</h3>
        {value.steps.map((step, index) => (
          <div key={index} className="step-card">
            <input
              value={step.title}
              placeholder={`ขั้นตอนที่ ${index + 1}`}
              onChange={(event) => {
                const steps = [...value.steps];
                steps[index] = { ...step, title: event.target.value };
                updateField("steps", steps);
              }}
            />
            <textarea
              value={step.body}
              placeholder="รายละเอียดขั้นตอน"
              onChange={(event) => {
                const steps = [...value.steps];
                steps[index] = { ...step, body: event.target.value };
                updateField("steps", steps);
              }}
            />
          </div>
        ))}
        <button type="button" onClick={() => updateField("steps", [...value.steps, emptyStep])}>เพิ่มขั้นตอน</button>
      </section>
      <button type="submit">บันทึก</button>
    </form>
  );
}
