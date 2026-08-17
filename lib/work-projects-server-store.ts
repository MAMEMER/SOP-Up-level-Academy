import "server-only";
import { adminDb, hasAdminCredentials } from "./firebase-admin.ts";
import { WORK_PROJECTS_COLLECTION, type WorkProject } from "./work-projects.ts";

// อ่านงานโปรเจกต์ทั้งหมด (ทุกสาขา) ด้วย service account — ใช้ป้อน ledger ผลตรวจเข้า KPI.
// dev preview (ไม่มี service account) → คืน [] ไม่ให้ throw. งานโปรเจกต์อยู่ใน Firestore เท่านั้น
// (ไม่มี local-file fallback เหมือน stock/adjustments — หน้า projects เขียนผ่าน Admin SDK อยู่แล้ว).
export async function fetchAllWorkProjects(): Promise<WorkProject[]> {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb().collection(WORK_PROJECTS_COLLECTION).get();
  return snap.docs.map((doc) => doc.data() as WorkProject);
}
