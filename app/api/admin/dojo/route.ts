import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth.ts';
import { canManageStaffAccounts } from '../../../../lib/owner.ts';
import { hasSessionSecret } from '../../../../lib/session-jwt.ts';
import { hasAdminCredentials } from '../../../../lib/firebase-admin.ts';
import { listPosters, submitReview } from '../../../../lib/poster-dojo-server.ts';
export const dynamic = 'force-dynamic';
async function access() {
  const user = await requireUser();
  return canManageStaffAccounts(user.actualEmail) && !user.isImpersonating && hasSessionSecret() ? user : null;
}
export async function GET() {
  const user = await access();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  try { return NextResponse.json({ posters: await listPosters() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'read_failed' }, { status: 500 }); }
}
export async function POST(request: Request) {
  const user = await access();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  const b = await request.json().catch(() => null);
  if (!b || typeof b.id !== 'string' || !b.id || b.id.includes('/') || typeof b.version !== 'string' ||
      !['approved','rejected','revise'].includes(b.action) || typeof b.comment !== 'string' || b.comment.length > 10000 ||
      typeof b.asRule !== 'boolean' || !['major','critical','minor'].includes(b.severity)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    await submitReview({ ...b, severity: { major: '🟡', critical: '🔴', minor: '🟢' }[b.severity as 'major'] }, { email: user.actualEmail, name: user.actualName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : '';
    return NextResponse.json({ error: ['conflict','comment_required','not_found'].includes(error) ? error : 'write_failed' }, { status: error === 'conflict' ? 409 : error === 'comment_required' ? 400 : 500 });
  }
}
