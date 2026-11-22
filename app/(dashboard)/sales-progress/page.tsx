import { kpiV2Visible } from "../../../lib/launch-gate.ts";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "../../../lib/auth.ts";
import { SalesProgress } from "../../../components/SalesProgress.tsx";
export const dynamic = "force-dynamic";
export default async function SalesProgressPage() {
  const user = await requireUser(); if (!kpiV2Visible(user.role)) notFound();
  return <main className="page"><Link href="/my-view" className="back-link">← กลับหน้าของฉัน</Link><SalesProgress /></main>;
}
