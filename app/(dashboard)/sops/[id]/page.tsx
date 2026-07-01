import { notFound } from "next/navigation";
import { StatusBadge } from "../../../../components/StatusBadge.tsx";
import { createClient } from "../../../../lib/supabase/server.ts";

export default async function SopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: sop } = await supabase
    .from("sops")
    .select("*,departments(display_name),sop_steps(*)")
    .eq("id", id)
    .single();

  if (!sop) notFound();

  return (
    <main className="page">
      <h1>{sop.title}</h1>
      <StatusBadge status={sop.status} />
      <section className="panel">
        <h2>วัตถุประสงค์</h2>
        <p>{sop.purpose}</p>
        <h2>ใช้เมื่อไหร่</h2>
        <p>{sop.when_to_use}</p>
        <h2>ขั้นตอน</h2>
        {(sop.sop_steps ? sop.sop_steps : []).map((step: { id: string; step_order: number; title: string; body: string }) => (
          <article key={step.id}>
            <h3>{step.step_order}. {step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
