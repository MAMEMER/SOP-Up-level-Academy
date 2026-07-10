import Link from "next/link";
import { createClient } from "../../lib/supabase/server.ts";

type DepartmentRow = {
  id: string;
  display_name: string;
};

type SopRow = {
  id: string;
  title: string;
  department_id: string;
  purpose: string;
  updated_at: string;
  departments: Array<{ display_name: string }> | null;
};

const departmentOrder = ["หน้าร้าน", "stock", "แอดมิน", "บัญชี"];

function departmentRank(department: DepartmentRow) {
  const label = department.display_name.toLowerCase();
  const index = departmentOrder.findIndex((name) => name.toLowerCase() === label);
  return index === -1 ? departmentOrder.length : index;
}

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const [{ data: departments }, { data: sops }] = await Promise.all([
    supabase.from("departments").select("id,display_name").order("display_name"),
    supabase
      .from("sops")
      .select("id,title,department_id,purpose,updated_at,departments(display_name)")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
  ]);

  const publishedSops = (sops ? sops : []) as SopRow[];
  const orderedDepartments = [...((departments ? departments : []) as DepartmentRow[])].sort((left, right) => {
    const rankDifference = departmentRank(left) - departmentRank(right);
    if (rankDifference !== 0) return rankDifference;
    return left.display_name.localeCompare(right.display_name);
  });

  return (
    <main className="public-page">
      <header className="public-nav">
        <Link href="/departments" className="public-brand">
          <span className="up-logo" aria-hidden="true">
            <span>UP</span>
            <strong>LEVEL</strong>
          </span>
          <strong>Up Level SOP</strong>
        </Link>
        <nav>
          <a href="#departments">หัวข้องาน</a>
          <a href="#latest">คู่มือใช้งาน</a>
        </nav>
      </header>

      <section className="public-hero">
        <p className="eyebrow">operations training</p>
        <h1>Up level manual</h1>
        <p>
          คู่มือการทำงานตามมาตรฐานร้าน Up level Academy
        </p>
        <div className="hero-actions">
          <a href="#departments" className="green-button">เลือกหัวข้องาน</a>
          <a href="#latest" className="soft-button">ดูหัวข้อล่าสุด</a>
        </div>
      </section>

      <section id="departments" className="public-section">
        <div className="section-heading">
          <p className="eyebrow">departments</p>
          <h2>เลือกหัวข้องาน</h2>
          <p>แต่ละหัวข้อแสดงเฉพาะ SOP ที่เผยแพร่แล้วและเปิดอ่านได้แบบสาธารณะ</p>
        </div>
        <div className="public-grid">
          {orderedDepartments.map((department) => {
            const count = publishedSops.filter((sop) => sop.department_id === department.id).length;
            return (
              <a key={department.id} href={`#department-${department.id}`} className="public-card lift-card">
                <span className="card-icon">{department.display_name.slice(0, 1)}</span>
                <strong>{department.display_name}</strong>
                <small>{count} คู่มือพร้อมใช้งาน</small>
              </a>
            );
          })}
        </div>
      </section>

      <section id="latest" className="public-section">
        <div className="section-heading">
          <p className="eyebrow">published sops</p>
          <h2>หัวข้อที่ใช้งานได้</h2>
          <p>กดเข้าไปอ่านขั้นตอนและเช็กลิสต์ผ่านหน้าเว็บได้ทันที</p>
        </div>
        <div className="sop-public-list">
          {publishedSops.map((sop) => (
            <Link key={sop.id} href={`/public/sops/${sop.id}`} className="sop-public-row lift-card">
              <div>
                <span>{sop.departments?.[0]?.display_name || "SOP"}</span>
                <strong>{sop.title}</strong>
                <p>{sop.purpose}</p>
              </div>
              <em>เปิดอ่าน</em>
            </Link>
          ))}
        </div>
      </section>

      {orderedDepartments.map((department) => {
        const items = publishedSops.filter((sop) => sop.department_id === department.id);
        if (!items.length) return null;
        return (
          <section key={department.id} id={`department-${department.id}`} className="public-section">
            <div className="section-heading">
              <p className="eyebrow">department</p>
              <h2>{department.display_name}</h2>
            </div>
            <div className="public-grid two">
              {items.map((sop) => (
                <Link key={sop.id} href={`/public/sops/${sop.id}`} className="public-card lift-card">
                  <span className="card-icon">✓</span>
                  <strong>{sop.title}</strong>
                  <small>{sop.purpose}</small>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
