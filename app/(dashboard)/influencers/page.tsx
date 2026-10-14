import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { InfluencerTracker } from "../../../components/InfluencerTracker.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "อินฟลูเอนเซอร์ · Influencer Tracker | Up Level SOP" };
export default async function InfluencersPage() {
  const user = await requireUser();
  return <main className="page"><Link href="/" className="back-link">กลับหน้าหลัก</Link><section className="board-hero"><div><p className="eyebrow">Up Level · พันธมิตรคอนเทนต์</p><h2>Influencer Tracker</h2><p>อินฟลูเอนเซอร์ · ติดตามการทักช่องและคุยงานของมุกกับทีม</p></div></section><InfluencerTracker readOnly={user.isImpersonating} userKey={user.actualEmail} /></main>;
}
