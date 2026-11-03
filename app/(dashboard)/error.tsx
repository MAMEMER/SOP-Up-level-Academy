"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">เกิดข้อผิดพลาด</p>
          <h2>โหลดหน้านี้ไม่สำเร็จ</h2>
          <p>อาจเป็นเพราะอินเทอร์เน็ตหลุดหรือระบบขัดข้องชั่วคราว ลองโหลดใหม่อีกครั้ง ถ้ายังไม่ได้ให้กลับหน้าหลักแล้วแจ้งบัค</p>
          {error.digest ? <p className="sop-error-digest">รหัสอ้างอิง: {error.digest}</p> : null}
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-action" onClick={() => reset()}>
            ลองใหม่
          </button>
          <Link href="/" className="btn-soft">
            กลับหน้าหลัก
          </Link>
        </div>
      </section>
    </main>
  );
}
