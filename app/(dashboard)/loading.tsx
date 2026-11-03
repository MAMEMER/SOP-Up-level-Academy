// โครงหน้าระหว่างรอข้อมูลฝั่ง server — แถบเมนูยังอยู่ (layout ไม่โหลดใหม่) เห็นแค่ส่วนเนื้อหา
export default function DashboardLoading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <section className="board-hero">
        <div>
          <span className="sop-skeleton sop-skeleton--eyebrow" />
          <span className="sop-skeleton sop-skeleton--title" />
          <span className="sop-skeleton sop-skeleton--line" />
        </div>
      </section>
      <p className="sop-loading-label">กำลังโหลด…</p>
      <div className="sop-skeleton-stack">
        <span className="sop-skeleton sop-skeleton--block" />
        <span className="sop-skeleton sop-skeleton--block" />
        <span className="sop-skeleton sop-skeleton--block is-short" />
      </div>
    </main>
  );
}
