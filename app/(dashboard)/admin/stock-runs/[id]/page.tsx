import { redirect } from "next/navigation";
import { requireUser } from "../../../../../lib/auth.ts";
import { StockRunReview } from "../../../../../components/StockRunReview.tsx";

// Owner review page for one Stock Run. The server component only resolves the viewer's
// role; the client child loads the run from the API and handles อนุมัติ / ให้แก้ไข writes.
export default async function AdminStockRunReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  const { id } = await params;

  return <StockRunReview id={decodeURIComponent(id)} isOwner={!user.isImpersonating} />;
}
