"use client";

import { useEffect, useState, type FormEvent } from "react";
import { peerReviewItems, ratingOptions, validatePeerReview, type Rating } from "../lib/peer-review.ts";

const ratingClass: Record<Rating, string> = { 4: "is-next", 3: "is-hold", 2: "is-na", 1: "is-below" };

type Draft = { ratings: Record<string, number>; examples: Record<string, string> };

/**
 * ฟอร์มประเมิน 360 หนึ่งคน — เช็คก่อนส่ง (ให้ 1 หรือ 4 ต้องมีตัวอย่าง) เพื่อไม่ให้ส่งไม่ผ่านแล้วค่าที่เลือกไว้หาย
 * และเก็บร่างไว้ในเครื่อง (localStorage) จนกว่าจะส่งสำเร็จ — ปิดหน้าไปกลับมาก็ยังอยู่.
 */
export function PeerReviewForm({
  action,
  period,
  ratee,
  rateeName,
  initial,
  saved
}: {
  action: (formData: FormData) => Promise<void>;
  period: string;
  ratee: string;
  rateeName: string;
  initial?: Draft;
  /** เพิ่งบันทึกสำเร็จ → ล้างร่าง */
  saved: boolean;
}) {
  const key = `sop-peer-draft:${period}:${ratee}`;
  const [draft, setDraft] = useState<Draft>(initial || { ratings: {}, examples: {} });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (saved) {
        localStorage.removeItem(key);
        return;
      }
      const raw = localStorage.getItem(key);
      if (raw) setDraft(JSON.parse(raw) as Draft);
    } catch {
      // private mode / storage blocked — ใช้ค่าที่บันทึกไว้ในระบบแทน
    }
  }, [key, saved]);

  function update(next: Draft) {
    setDraft(next);
    setError(null);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const invalid = validatePeerReview(draft);
    if (invalid) {
      event.preventDefault();
      setError(invalid);
    }
  }

  return (
    <form action={action} onSubmit={onSubmit} className="skill-review__form">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="ratee" value={ratee} />
      {peerReviewItems.map((item, index) => {
        const value = draft.ratings[item.id];
        const needsExample = value === 1 || value === 4;
        return (
          <div key={item.id} className="skill-review__row">
            <div className="skill-review__head">
              <strong>
                {index + 1}. {item.text}
              </strong>
            </div>
            <div className="skill-review__choices" role="radiogroup" aria-label={item.text}>
              {ratingOptions.map((option) => (
                <label key={option.value} className={`skill-review__choice ${ratingClass[option.value]}`}>
                  <input
                    type="radio"
                    name={`r_${item.id}`}
                    value={option.value}
                    checked={value === option.value}
                    onChange={() => update({ ...draft, ratings: { ...draft.ratings, [item.id]: option.value } })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <div className="skill-review__note">
              <input
                name={`e_${item.id}`}
                maxLength={300}
                required={needsExample}
                value={draft.examples[item.id] || ""}
                onChange={(event) => update({ ...draft, examples: { ...draft.examples, [item.id]: event.target.value } })}
                placeholder={needsExample ? "ต้องเขียนตัวอย่างที่เห็นหนึ่งประโยค" : "ตัวอย่างที่เห็น (ไม่บังคับ)"}
              />
            </div>
          </div>
        );
      })}
      {error ? <p className="input-status warning">{error}</p> : null}
      <div className="skill-review__submit">
        <button type="submit">บันทึกผลของ {rateeName}</button>
      </div>
    </form>
  );
}
