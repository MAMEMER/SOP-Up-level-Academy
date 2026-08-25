import type { SelfReview } from "../lib/self-review.ts";

// หน้า "ประเมินผลงานตัวเอง" — อ่านแล้วต้องตอบได้ 3 อย่าง: รอบนี้เสียคะแนนไปกับอะไร,
// เรื่องไหนโดนซ้ำที่สุด, และพรุ่งนี้ต้องทำอะไรต่างจากเดิม. ตัวเลขทั้งหมดมาจาก KPI ชุดเดียว
// กับหน้าคะแนนของหัวหน้า — ที่ต่างคือการจัดเรียงให้เป็นสิ่งที่ลงมือได้.
export function SelfReviewBoard({ review, periodLabel }: { review: SelfReview; periodLabel: string }) {
  return (
    <div className="self-review">
      <section className="self-review__headline">
        <p className="eyebrow">สรุปรอบ {periodLabel}</p>
        <h3>{review.headline}</h3>
        <div className="self-review__totals">
          <span className="self-review__total">
            <strong>{review.hasData ? review.totalScore : "—"}</strong>
            <small>/100 คะแนนรวม</small>
          </span>
          <span className="self-review__gain">
            <strong>+{review.gainedPoints}</strong>
            <small>คะแนนที่ได้/ได้คืน</small>
          </span>
          <span className="self-review__loss">
            <strong>−{review.lostPoints}</strong>
            <small>คะแนนที่เสียไป</small>
          </span>
        </div>
      </section>

      {review.focus.length ? (
        <section className="self-review__focus">
          <p className="self-review__label">ต้องแก้ 3 เรื่องนี้ก่อน</p>
          <ol>
            {review.focus.map((offence, index) => (
              <li key={`${offence.category}-${offence.reason}`}>
                <p className="self-review__focus-head">
                  <span className="self-review__rank">{index + 1}</span>
                  <span className="self-review__focus-title">{offence.label}</span>
                  <span className="self-review__focus-cost">
                    −{offence.points} คะแนน · {offence.times} ครั้ง
                  </span>
                </p>
                <p className="self-review__advice">{offence.advice}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="self-review__clean">รอบนี้ยังไม่มีเรื่องที่ต้องแก้ — ทำแบบนี้ต่อไป</p>
      )}

      <section className="self-review__categories">
        <p className="self-review__label">คะแนนแต่ละหมวด</p>
        <div className="self-review__cat-grid">
          {review.categories.map((category) => (
            <div key={category.key} className="self-review__cat">
              <span className="self-review__cat-name">{category.label}</span>
              <strong className={category.score < 0 ? "self-review__cat-negative" : undefined}>
                {category.score}
                <small>/{category.maxScore}</small>
              </strong>
              <small className="self-review__cat-lost">
                {category.score < 0
                  ? `เสียไป ${category.lostPoints} — เกินเพดานหมวดนี้ จึงติดลบและดึงคะแนนรวมลง`
                  : category.lostPoints > 0
                    ? `เสียไป ${category.lostPoints}`
                    : "ยังไม่เสีย"}
              </small>
            </div>
          ))}
        </div>
      </section>

      {review.offences.length ? (
        <section className="self-review__table-wrap">
          <p className="self-review__label">โดนหักจากอะไรบ้าง (เรียงจากมากไปน้อย)</p>
          <table className="self-review__table">
            <thead>
              <tr>
                <th scope="col">เรื่อง</th>
                <th scope="col">หมวด</th>
                <th scope="col">ครั้ง</th>
                <th scope="col">คะแนน</th>
              </tr>
            </thead>
            <tbody>
              {review.offences.map((offence) => (
                <tr key={`${offence.category}-${offence.reason}`}>
                  <th scope="row">
                    {offence.label}
                    {/* จอเล็กซ่อนคอลัมน์หมวด — ติดชื่อหมวดไว้ใต้ชื่อเรื่องแทน ไม่งั้นสองเรื่องชื่อเดียวกัน
                        คนละหมวดจะดูเหมือนบรรทัดซ้ำ */}
                    <small className="self-review__row-cat">{offence.categoryLabel}</small>
                  </th>
                  <td>{offence.categoryLabel}</td>
                  <td>{offence.times}</td>
                  <td className="self-review__minus">−{offence.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="self-review__lists">
        <section>
          <p className="self-review__label">ได้คะแนนจาก</p>
          {review.gains.length ? (
            <ul className="self-review__events">
              {review.gains.map((event, index) => (
                <li key={`gain-${index}`}>
                  <span className="self-review__plus">+{event.points}</span>
                  <span>{event.detail}</span>
                  <small>{event.categoryLabel}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="self-review__empty">รอบนี้ยังไม่มีคะแนนที่ได้เพิ่ม — ส่งงานก่อนกำหนดและผ่านตั้งแต่รอบแรกจะได้เพิ่ม</p>
          )}
        </section>

        <section>
          <p className="self-review__label">เสียคะแนนจาก</p>
          {review.losses.length ? (
            <ul className="self-review__events">
              {review.losses.map((event, index) => (
                <li key={`loss-${index}`}>
                  <span className="self-review__minus">{event.points}</span>
                  <span>{event.detail}</span>
                  <small>{event.categoryLabel}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="self-review__empty">รอบนี้ยังไม่เสียคะแนนเลย</p>
          )}
        </section>
      </div>
    </div>
  );
}
