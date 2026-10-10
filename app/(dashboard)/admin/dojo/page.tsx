import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../../lib/auth.ts';
import { canManageStaffAccounts } from '../../../../lib/owner.ts';
import { hasSessionSecret } from '../../../../lib/session-jwt.ts';
import { PosterDojo } from '../../../../components/PosterDojo.tsx';
export default async function DojoPage() {
  const user = await requireUser();
  if (!canManageStaffAccounts(user.actualEmail) || user.isImpersonating) redirect('/admin');
  return <main className="page dojo-page">
    <Link href="/admin" className="back-link">กลับหน้ารวมงานจัดการ</Link>
    <section className="board-hero"><div><p className="eyebrow">POSTER DOJO</p><h2>รีวิวโปสเตอร์</h2><p>เทียบภาพอ้างอิง แล้วส่งความเห็นให้แก้ก่อนนำไปใช้</p></div></section>
    <PosterDojo reviewer={user.actualName} authenticated={hasSessionSecret()} />
  </main>;
}
