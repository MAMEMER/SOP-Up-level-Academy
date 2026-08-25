import "server-only";
import { fetchPerformanceDailyStore as fetchManualRecords, type PerformanceDailyStore } from "./performance-service-records.ts";
import { fetchStockCheckRecords } from "./stock-check-store.ts";
import { fetchChecklistAuditRecords } from "./checklist-audit-store.ts";
import { fetchScoreAdjustments } from "./score-adjustment-store.ts";
import { fetchKpiRules } from "./kpi-rules-store.ts";
import { fetchAllWorkProjects } from "./work-projects-server-store.ts";
import { projectReviewsToAdjustments } from "./project-review.ts";
import { projectNoProgressAdjustments } from "./assigned-work-auto-kpi.ts";
import { bangkokToday } from "./performance-score-data.ts";
import { defaultKpiRules } from "./kpi-rules.ts";

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
  // Auto KPI ข้อ 3 (ใบงาน QZIE): งานยังอยู่ในกำหนดแต่วันนั้นไม่มีการอัปเดตความคืบหน้า → หักอัตโนมัติ
  // ต่อวัน — คิดจากข้อมูล progress จริง ไม่ต้องให้แอดมินกดอะไร (คู่ขนานกับ Checklist ที่หัก "ขาดทั้งวัน").
  const noProgressAdjustments = projectNoProgressAdjustments(projects, {
    today: bangkokToday(),
    ratePerDay: kpiRules?.assignedWork?.noProgressPerDay ?? defaultKpiRules.assignedWork.noProgressPerDay
  });
  return {
    ...manual,
    stockCheckRecords,
    checklistAuditRecords,
    scoreAdjustments: [...(scoreAdjustments || []), ...projectReviewAdjustments, ...noProgressAdjustments],
    kpiRules
  };
}
