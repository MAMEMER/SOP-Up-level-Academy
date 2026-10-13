import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, ExternalLink, LayoutTemplate, ScanEye } from 'lucide-react';
import { requireUser } from '../../../../lib/auth.ts';
import { canManageStaffAccounts } from '../../../../lib/owner.ts';
import { hasSessionSecret } from '../../../../lib/session-jwt.ts';
import { DojoRuns } from '../../../../components/DojoRuns.tsx';
import { POSTER_EDITOR_URL } from '../../../../lib/dojo-runs.ts';
import '../../../../components/DojoRuns.css';

export default async function PostersPage() {
  const user = await requireUser();
  if (!canManageStaffAccounts(user.actualEmail) || user.isImpersonating) redirect('/admin');
  return <main className="page posters-page">
    <Link href="/admin" className="back-link">กลับหน้ารวมงานจัดการ</Link>
    <section className="board-hero"><div>
      <p className="eyebrow">POSTER</p><h2>ทำโพสเตอร์</h2>
      <p>สั่งงาน ดูทุกขั้น สั่งแก้ แล้วงานที่ผ่านจะกลายเป็นเทมเพลตให้ใช้ต่อ</p>
    </div></section>
    <nav className="posters-links" aria-label="เครื่องมือโปสเตอร์">
      <a href={POSTER_EDITOR_URL} target="_blank" rel="noopener noreferrer"><LayoutTemplate size={20} /><span><b>เครื่องมือทำโพส</b><small>เลือกเทมเพลต แก้คำ/รูป ดาวน์โหลด PNG</small></span><ExternalLink size={16} /></a>
      <Link href="/admin/dojo"><ScanEye size={20} /><span><b>รีวิวโปสเตอร์ (ระบบเดิม)</b><small>ใบที่ทำไว้ก่อนมีสายพาน</small></span></Link>
      <Link href="/admin/posters/guide"><BookOpen size={20} /><span><b>คู่มือ</b><small>อ่านก่อนใช้ครั้งแรก 5 นาที</small></span></Link>
    </nav>
    <h3 className="posters-section-title">สายพานทำโพส</h3>
    <DojoRuns reviewer={user.actualName} authenticated={hasSessionSecret()} />
  </main>;
}
