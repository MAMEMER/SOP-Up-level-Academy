import "server-only";
import { fetchPerformanceDailyStore as fetchManualRecords, type PerformanceDailyStore } from "./performance-service-records.ts";
import { fetchStockCheckRecords } from "./stock-check-store.ts";
import { fetchChecklistAuditRecords } from "./checklist-audit-store.ts";
import { fetchScoreAdjustments } from "./score-adjustment-store.ts";
import { fetchKpiRules } from "./kpi-rules-store.ts";
import { fetchAllWorkProjects } from "./work-projects-server-store.ts";
import { projectReviewsToAdjustments } from "./project-review.ts";
import { idleDayAdjustments } from "./project-handover.ts";

/**
 * Every manual KPI input in one object.
 *
 * Complaint and assigned-work records go through the public REST key; stock checks and
 * checklist audits need the service account (the shared firestore.rules do not open their
 * collections). This composer is where they meet, so lib/performance-service-records.ts can
 * stay free of "server-only" and keep its record helpers unit-testable.
 */
export async function fetchPerformanceDailyStore(): Promise<PerformanceDailyStore> {
  const [manual, stockCheckRecords, checklistAuditRecords, scoreAdjustments, kpiRules, projects] = await Promise.all([
    fetchManualRecords(),
    fetchStockCheckRecords(),
    fetchChecklistAuditRecords(),
    fetchScoreAdjustments(),
    fetchKpiRules(),
    fetchAllWorkProjects()
  ]);
  // ผลตรวจงานที่มอบหมายรายคน (หน้า /admin/projects) เข้า KPI ผ่าน channel เดียวกับ
  // owner corrections — พนักงานจึงโดนหัก/ได้คืนคะแนนจริงในหน้าคะแนนพนักงานโดยไม่ต้องแก้ engine.
  const projectReviewAdjustments = projectReviewsToAdjustments(projects);
  // งานที่ยังอยู่ในกำหนดแต่เงียบทั้งวัน — หักผู้รับผิดชอบ "ของวันนั้น" (ส่งต่องานแล้วก็ตามตัวถูกคน).
  // คิดสดจากเอกสารงานทุกครั้ง ไม่เขียนลง Firestore: id เป็น deterministic ต่อ (งาน, วัน, คน)
  // จึงไม่มีทางหักซ้ำแม้หน้าคะแนนจะถูกเปิดกี่รอบ.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const idleAdjustments = projects.flatMap((project) => idleDayAdjustments(project, today, kpiRules.assignedWork.idleDay));
  return {
    ...manual,
    stockCheckRecords,
    checklistAuditRecords,
    scoreAdjustments: [...(scoreAdjustments || []), ...projectReviewAdjustments, ...idleAdjustments],
    kpiRules
  };
}
