import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { adminDb, hasAdminCredentials } from "../../../lib/firebase-admin.ts";

export const dynamic = "force-dynamic";

type TownhallDeck = { title: string; date?: string; url: string; note?: string };

// The deck link lives in Firestore (sop_config/townhall), not in this public repo.
async function loadDecks(): Promise<TownhallDeck[]> {
  if (!hasAdminCredentials()) return [];
  const data = (await adminDb().doc("sop_config/townhall").get()).data();
  const decks = Array.isArray(data?.decks) ? data.decks : [];
  return decks.filter((d: unknown): d is TownhallDeck => {
    const deck = d as Partial<TownhallDeck>;
    return typeof deck?.title === "string" && typeof deck.url === "string" && /^https:\/\//.test(deck.url);
  });
}

export default async function TownhallPage() {
  await requireUser();
  const decks = await loadDecks().catch(() => []);
  return (
    <main className="page">
      <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
      <section className="board-hero">
        <div>
          <p className="eyebrow">ประชุมทีม</p>
          <h2>สไลด์ Townhall</h2>
          <p>ทิศทางร้าน ระบบ KPI ใหม่ และ incentive · เปิดอ่านซ้ำได้ตลอด</p>
        </div>
      </section>
      {decks.length === 0 ? (
        <section className="owner-ops__panel"><p>ยังไม่มีสไลด์</p></section>
      ) : decks.map((deck) => (
        <section className="owner-ops__panel" key={deck.url}>
          <h3>{deck.title}</h3>
          {deck.date ? <p>{deck.date}</p> : null}
          {deck.note ? <p>{deck.note}</p> : null}
          <a href={deck.url} target="_blank" rel="noopener noreferrer" className="primary-action">เปิดสไลด์</a>
        </section>
      ))}
    </main>
  );
}
