const departments = ["หน้าร้าน", "Stock", "แอดมิน", "บัญชี"];

const sops = [
  { title: "เปิดร้านประจำวัน", dept: "หน้าร้าน", status: "Published", tag: "งานประจำวัน" },
  { title: "รับสินค้าเข้าคลัง", dept: "Stock", status: "Published", tag: "สต็อก" },
  { title: "ปิดยอดขายสิ้นวัน", dept: "บัญชี", status: "Pending Approval", tag: "การเงิน" },
  { title: "จัดการคำร้องพนักงาน", dept: "แอดมิน", status: "Needs Revision", tag: "HR/Admin" }
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>SOP Library</strong>
            <small>Internal Portal</small>
          </div>
        </div>
        <nav className="nav-list">
          <a className="active" href="#">หน้าหลัก</a>
          <a href="#">ฝ่ายงาน</a>
          <a href="#">ร่างของฉัน</a>
          <a href="#">รออนุมัติ</a>
          <a href="#">ผู้ใช้</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>หน้าหลักฝ่ายงาน</h1>
            <p>พนักงานอ่าน SOP ที่อนุมัติแล้ว หัวหน้าส่งร่างให้แอดมินตรวจ</p>
          </div>
          <div className="user-chip">Admin · Uplevel</div>
        </header>

        <section className="search-panel">
          <label htmlFor="search">ค้นหา SOP</label>
          <div className="search-row">
            <input id="search" placeholder="เช่น เปิดร้าน, รับสินค้า, ปิดยอด, คืนสินค้า" />
            <button>ค้นหา</button>
          </div>
        </section>

        <section className="metrics-grid">
          <article>
            <span>Published</span>
            <strong>28</strong>
          </article>
          <article>
            <span>Pending Approval</span>
            <strong>4</strong>
          </article>
          <article>
            <span>Needs Revision</span>
            <strong>2</strong>
          </article>
          <article>
            <span>Departments</span>
            <strong>4</strong>
          </article>
        </section>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>ฝ่ายงาน</h2>
              <button className="ghost">จัดการ</button>
            </div>
            <div className="department-grid">
              {departments.map((department) => (
                <button key={department} className="department-card">
                  <span>{department}</span>
                  <small>ดู SOP ของฝ่าย</small>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>SOP ล่าสุด</h2>
              <button className="ghost">สร้าง SOP</button>
            </div>
            <div className="sop-list">
              {sops.map((sop) => (
                <article key={sop.title} className="sop-row">
                  <div>
                    <h3>{sop.title}</h3>
                    <p>{sop.dept} · {sop.tag}</p>
                  </div>
                  <span className={`status ${sop.status.toLowerCase().replaceAll(" ", "-")}`}>{sop.status}</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
