import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { SellPost } from "../../../components/SellPost.tsx";
export const dynamic = "force-dynamic";
export default async function Page() { await requireUser(); return <main className="page"><Link href="/my-view" className="back-link">← กลับหน้าของฉัน</Link><SellPost /></main>; }
