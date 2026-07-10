import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicSopRunner } from "../../../../components/PublicSopRunner.tsx";
import { createClient } from "../../../../lib/supabase/server.ts";

type SopStep = {
  id: string;
  step_order: number;
  title: string;
  body: string;
  checklist_items?: string[];
  duration_minutes?: number | null;
};

type PublicSop = {
  id: string;
  title: string;
  status: string;
  purpose: string;
  when_to_use: string;
  responsible_role: string;
  required_tools: string;
  precautions: string;
  faq: string;
  tags: string[];
  departments: Array<{ display_name: string }> | null;
  sop_steps: SopStep[];
};

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export default async function PublicSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: sop } = await supabase
    .from("sops")
    .select("*,departments(display_name),sop_steps(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!sop) notFound();
  const item = sop as PublicSop;
  const steps = [...(item.sop_steps || [])].sort((left, right) => left.step_order - right.step_order);

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
          <Link href="/departments">ฝ่ายงาน</Link>
        </nav>
      </header>

      <article className="public-detail">
        <Link href="/departments" className="back-link">← กลับไปหน้าฝ่ายงาน</Link>
        <p className="eyebrow">{item.departments?.[0]?.display_name || "published sop"}</p>
        <h1>{item.title}</h1>
        <p className="detail-lead compact">{item.purpose}</p>

        <div className="detail-meta">
          <section>
            <span>ใช้เมื่อไหร่</span>
            <strong>{item.when_to_use}</strong>
          </section>
          <section>
            <span>ผู้รับผิดชอบ</span>
            <strong>{item.responsible_role}</strong>
          </section>
        </div>

        <PublicSopRunner steps={steps} tools={lines(item.required_tools)} />

        <section className="detail-footer-grid">
          <div className="public-card detail-block">
            <h2>ข้อควรระวัง</h2>
            <p>{item.precautions}</p>
          </div>
          <div className="public-card detail-block">
            <h2>คำถามที่พบบ่อย</h2>
            <p>{item.faq}</p>
          </div>
        </section>
      </article>
    </main>
  );
}
