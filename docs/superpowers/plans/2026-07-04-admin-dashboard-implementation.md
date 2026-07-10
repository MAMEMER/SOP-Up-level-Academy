# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working FoodStory-inspired Admin Owner Dashboard for a card shop at `/admin/ops`, separate from the Staff Checklist but backed by shared-ready mock/store data.

**Architecture:** Add pure TypeScript admin dashboard data and service functions first, covered by node:test. Then add a client dashboard component that consumes the mock state, supports search/filter/detail/action interactions, and renders a FoodStory-like owner summary adapted for card-shop operations. Keep backend-facing behavior behind service functions so Supabase can replace the mock source later.

**Tech Stack:** Next.js App Router, React client components, TypeScript, existing global CSS, node:test with `--experimental-strip-types`.

---

## File Structure

- Create `lib/admin-dashboard-data.ts`: TypeScript domain types plus realistic mock data for staff, checklist, orders, sales, stock, issues, reviews, and audit logs.
- Create `lib/admin-dashboard-store.ts`: Pure service functions for summary calculations and state transitions.
- Create `tests/admin-dashboard-store.test.ts`: TDD coverage for service functions and summary counts.
- Create `components/AdminOpsDashboard.tsx`: Client UI and interaction state for the owner dashboard.
- Create `app/(dashboard)/admin/ops/page.tsx`: Admin route entry, guarded for admin/preview and rendering the dashboard.
- Modify `components/AppShell.tsx`: Add admin navigation link to the new owner dashboard.
- Modify `app/globals.css`: Add FoodStory-inspired admin dashboard layout, cards, tables, badges, drawer, and responsive rules.

---

### Task 1: Store Tests First

**Files:**
- Create: `tests/admin-dashboard-store.test.ts`
- Later create: `lib/admin-dashboard-data.ts`
- Later create: `lib/admin-dashboard-store.ts`

- [ ] **Step 1: Write failing tests for admin service behavior**

Create `tests/admin-dashboard-store.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockAdminDashboardState } from "../lib/admin-dashboard-data.ts";
import {
  approveChecklistItem,
  assignIssue,
  getAdminDashboardSummary,
  markChecklistFollowUp,
  requestCorrection,
  resolveIssue
} from "../lib/admin-dashboard-store.ts";

describe("admin dashboard store", () => {
  it("summarizes owner dashboard health metrics", () => {
    const summary = getAdminDashboardSummary(mockAdminDashboardState);

    assert.equal(summary.totalChecklist, 18);
    assert.equal(summary.completedChecklist, 10);
    assert.equal(summary.pendingChecklist, 8);
    assert.equal(summary.lateChecklist, 3);
    assert.equal(summary.pendingOrders, 8);
    assert.equal(summary.issueCount, 5);
    assert.equal(summary.stockAlerts, 7);
    assert.equal(summary.staffOnline, 4);
    assert.equal(summary.completionRate, 56);
  });

  it("approves a checklist item and writes an audit log", () => {
    const next = approveChecklistItem(mockAdminDashboardState, "check-open-cash", "owner-1");
    const item = next.checklistItems.find((entry) => entry.id === "check-open-cash");

    assert.equal(item?.adminReviewStatus, "approved");
    assert.equal(item?.followUp, false);
    assert.equal(next.auditLogs.at(-1)?.action, "approve_checklist");
    assert.equal(next.auditLogs.at(-1)?.targetId, "check-open-cash");
  });

  it("requests correction with a reason and writes an audit log", () => {
    const next = requestCorrection(mockAdminDashboardState, "check-stock-showcase", "owner-1", "ถ่ายรูปตู้โชว์ไม่ครบ");
    const item = next.checklistItems.find((entry) => entry.id === "check-stock-showcase");

    assert.equal(item?.adminReviewStatus, "correction_requested");
    assert.equal(item?.correctionReason, "ถ่ายรูปตู้โชว์ไม่ครบ");
    assert.equal(next.auditLogs.at(-1)?.action, "request_correction");
  });

  it("marks checklist follow up and writes an audit log", () => {
    const next = markChecklistFollowUp(mockAdminDashboardState, "check-online-replies", "owner-1");
    const item = next.checklistItems.find((entry) => entry.id === "check-online-replies");

    assert.equal(item?.followUp, true);
    assert.equal(item?.adminReviewStatus, "follow_up_required");
    assert.equal(next.auditLogs.at(-1)?.action, "mark_follow_up");
  });

  it("assigns and resolves an issue with audit logs", () => {
    const assigned = assignIssue(mockAdminDashboardState, "issue-missing-tracking", "staff-nam", "owner-1");
    const assignedIssue = assigned.issues.find((issue) => issue.id === "issue-missing-tracking");
    assert.equal(assignedIssue?.assignedTo, "staff-nam");
    assert.equal(assigned.auditLogs.at(-1)?.action, "assign_issue");

    const resolved = resolveIssue(assigned, "issue-missing-tracking", "owner-1");
    const resolvedIssue = resolved.issues.find((issue) => issue.id === "issue-missing-tracking");
    assert.equal(resolvedIssue?.status, "closed");
    assert.equal(resolved.auditLogs.at(-1)?.action, "resolve_issue");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm test -- tests/admin-dashboard-store.test.ts
```

Expected: FAIL because `lib/admin-dashboard-data.ts` and `lib/admin-dashboard-store.ts` do not exist yet.

---

### Task 2: Admin Data Model And Store

**Files:**
- Create: `lib/admin-dashboard-data.ts`
- Create: `lib/admin-dashboard-store.ts`
- Test: `tests/admin-dashboard-store.test.ts`

- [ ] **Step 1: Create admin data model and realistic mock data**

Create `lib/admin-dashboard-data.ts`:

```ts
export type StaffRole = "owner" | "manager" | "staff";
export type StaffStatus = "online" | "late" | "needs_review" | "shift_closed";
export type ChecklistStatus = "not_started" | "in_progress" | "completed" | "late" | "issue";
export type AdminReviewStatus = "waiting_review" | "approved" | "correction_requested" | "follow_up_required";
export type OrderChannel = "front_store" | "facebook" | "line" | "shopee" | "tiktok" | "instagram";
export type PaymentStatus = "paid" | "pending_slip" | "unpaid" | "refunded";
export type PackingStatus = "waiting" | "packed" | "problem";
export type ShippingStatus = "not_ready" | "ready" | "shipped" | "missing_tracking" | "problem";
export type IssueSeverity = "low" | "medium" | "high" | "urgent";
export type IssueStatus = "open" | "in_progress" | "waiting_review" | "closed";

export type Shift = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
};

export type Staff = {
  id: string;
  name: string;
  role: StaffRole;
  shift: string;
  status: StaffStatus;
  startedAt: string;
  lastActiveAt: string;
  latestTask: string;
  note: string;
};

export type ChecklistItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  assignedTo: string;
  status: ChecklistStatus;
  startedAt?: string;
  completedAt?: string;
  dueAt: string;
  evidence?: string;
  note?: string;
  adminReviewStatus: AdminReviewStatus;
  correctionReason?: string;
  followUp: boolean;
};

export type Order = {
  id: string;
  customerName: string;
  channel: OrderChannel;
  total: number;
  paymentStatus: PaymentStatus;
  packingStatus: PackingStatus;
  shippingStatus: ShippingStatus;
  trackingNumber?: string;
  assignedTo: string;
  updatedAt: string;
  note: string;
  issueFlag: boolean;
};

export type Payment = {
  method: "cash" | "transfer" | "qr" | "card";
  amount: number;
};

export type Shipment = {
  orderId: string;
  carrier: string;
  trackingNumber?: string;
  status: ShippingStatus;
};

export type SaleSummary = {
  grossSales: number;
  discount: number;
  cancelled: number;
  serviceCharge: number;
  shippingFee: number;
  tax: number;
  netSales: number;
  frontStoreSales: number;
  onlineSales: number;
  orderCount: number;
  averageOrderValue: number;
  openingChange: number;
  cashRemaining: number;
  expectedCash: number;
  cashDifference: number;
  moneyStatus: "matched" | "mismatch" | "needs_review";
  payments: Payment[];
  hourlySales: Array<{ hour: string; amount: number }>;
};

export type StockItem = {
  id: string;
  name: string;
  category: string;
  remaining: number;
  status: "normal" | "low" | "out" | "restock" | "damaged" | "lost";
  estimatedValue: number;
  lastCheckedBy: string;
  updatedAt: string;
  note: string;
};

export type HighValueCard = {
  id: string;
  name: string;
  category: string;
  status: "showcase" | "reserved" | "sold" | "changed_today" | "missing_review";
  estimatedValue: number;
  lastCheckedBy: string;
  updatedAt: string;
  note: string;
};

export type Issue = {
  id: string;
  title: string;
  detail: string;
  severity: IssueSeverity;
  assignedTo: string;
  status: IssueStatus;
  createdAt: string;
  deadline: string;
  notes: string[];
};

export type AdminReview = {
  id: string;
  targetType: "checklist" | "closing" | "order";
  targetId: string;
  status: AdminReviewStatus;
  reviewerId?: string;
  note: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  before: string;
  after: string;
  detail: string;
};

export type AdminDashboardState = {
  workDate: string;
  dateRange: string;
  branch: string;
  shopStatus: "not_open" | "opened" | "daytime" | "pre_close" | "closed";
  shifts: Shift[];
  staff: Staff[];
  checklistItems: ChecklistItem[];
  orders: Order[];
  shipments: Shipment[];
  saleSummary: SaleSummary;
  stockItems: StockItem[];
  highValueCards: HighValueCard[];
  issues: Issue[];
  adminReviews: AdminReview[];
  auditLogs: AuditLog[];
};

export const mockAdminDashboardState: AdminDashboardState = {
  workDate: "2026-07-04",
  dateRange: "04/07/2026 - 04/07/2026",
  branch: "UP Level บางแค",
  shopStatus: "daytime",
  shifts: [
    { id: "shift-open", label: "กะเปิดร้าน", startsAt: "09:00", endsAt: "17:00" },
    { id: "shift-close", label: "กะปิดร้าน", startsAt: "14:00", endsAt: "22:30" }
  ],
  staff: [
    { id: "staff-may", name: "เมย์", role: "manager", shift: "กะเปิดร้าน", status: "online", startedAt: "08:54", lastActiveAt: "15:22", latestTask: "ตรวจยอด QR", note: "ยอดตรงกับระบบ" },
    { id: "staff-nam", name: "น้ำ", role: "staff", shift: "กะเปิดร้าน", status: "late", startedAt: "09:05", lastActiveAt: "15:10", latestTask: "แพ็ก Shopee", note: "รอ tracking 4 รายการ" },
    { id: "staff-art", name: "อาร์ต", role: "staff", shift: "กะปิดร้าน", status: "needs_review", startedAt: "14:00", lastActiveAt: "15:18", latestTask: "ตรวจตู้โชว์", note: "รูปหลักฐานไม่ครบ" },
    { id: "staff-beam", name: "บีม", role: "staff", shift: "กะปิดร้าน", status: "online", startedAt: "14:02", lastActiveAt: "15:25", latestTask: "ตอบ LINE OA", note: "มีลูกค้ารอราคา Single" }
  ],
  checklistItems: [
    { id: "check-open-lights", category: "ก่อนเปิดร้าน", title: "เปิดไฟ แอร์ อินเทอร์เน็ต", description: "เปิดระบบพื้นฐานก่อนรับลูกค้า", assignedTo: "staff-may", status: "completed", startedAt: "08:55", completedAt: "09:02", dueAt: "09:30", evidence: "รูปหน้าร้าน", note: "พร้อมเปิด", adminReviewStatus: "approved", followUp: false },
    { id: "check-open-clean", category: "ก่อนเปิดร้าน", title: "ทำความสะอาดพื้นที่เล่น", description: "โต๊ะเล่นและเคาน์เตอร์ต้องพร้อมใช้งาน", assignedTo: "staff-may", status: "completed", startedAt: "09:02", completedAt: "09:18", dueAt: "09:30", evidence: "รูปพื้นที่เล่น", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-open-cash", category: "ก่อนเปิดร้าน", title: "ตรวจเงินทอน", description: "ตรวจเงินทอนตั้งต้นและบันทึกยอด", assignedTo: "staff-may", status: "completed", startedAt: "09:10", completedAt: "09:20", dueAt: "09:30", evidence: "ยอดเงิน 4,775", note: "เงินสดครบ", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-front-pos", category: "ช่วงเปิดร้าน", title: "เปิด POS และ QR Payment", description: "ตรวจ POS, QR และเครื่องพิมพ์", assignedTo: "staff-may", status: "completed", startedAt: "09:20", completedAt: "09:28", dueAt: "09:30", evidence: "รูปหน้าจอ POS", note: "", adminReviewStatus: "approved", followUp: false },
    { id: "check-online-replies", category: "งานแอดมินออนไลน์", title: "ตอบข้อความค้างทุกช่องทาง", description: "Facebook, LINE, Shopee, TikTok, Instagram", assignedTo: "staff-beam", status: "in_progress", startedAt: "10:00", dueAt: "15:00", evidence: "แคปหน้าจอ inbox", note: "เหลือลูกค้า LINE 2 ราย", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-order-slip", category: "งานขายหน้าร้าน", title: "ตรวจสลิปโอน", description: "ตรวจยอดโอนและจับคู่กับออเดอร์", assignedTo: "staff-may", status: "completed", startedAt: "11:00", completedAt: "11:20", dueAt: "12:00", evidence: "ยอด QR 31,600", note: "ตรง", adminReviewStatus: "approved", followUp: false },
    { id: "check-stock-showcase", category: "งานสต๊อก", title: "ตรวจตู้การ์ดมูลค่าสูง", description: "เช็กการ์ดโชว์เคสและสถานะจอง", assignedTo: "staff-art", status: "issue", startedAt: "13:30", dueAt: "14:00", evidence: "รูปตู้โชว์บางส่วน", note: "ขาดรูปชั้นล่าง", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-stock-restock", category: "งานสต๊อก", title: "สรุปสินค้าที่ต้องเติม", description: "เช็ก booster, sleeve, deck box", assignedTo: "staff-art", status: "late", startedAt: "14:20", dueAt: "14:45", note: "ยังไม่นับ One Piece", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-pack-shopee", category: "งานแพ็กส่ง", title: "แพ็ก Shopee รอบบ่าย", description: "แพ็กและเตรียม tracking", assignedTo: "staff-nam", status: "late", startedAt: "13:00", dueAt: "15:00", evidence: "รูปกล่อง", note: "ขาด tracking 4 รายการ", adminReviewStatus: "follow_up_required", followUp: true },
    { id: "check-pack-line", category: "งานแพ็กส่ง", title: "แพ็ก LINE OA", description: "ตรวจรายการและแพ็ก Single Card", assignedTo: "staff-nam", status: "completed", startedAt: "12:00", completedAt: "12:40", dueAt: "13:00", evidence: "tracking TH123", note: "", adminReviewStatus: "approved", followUp: false },
    { id: "check-event-table", category: "งานกิจกรรม", title: "เตรียมโต๊ะ tournament", description: "จัดโต๊ะและเลขโต๊ะ", assignedTo: "staff-beam", status: "completed", startedAt: "14:10", completedAt: "14:35", dueAt: "15:00", evidence: "รูปโต๊ะ", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-event-prize", category: "งานกิจกรรม", title: "เตรียมของรางวัล", description: "ตรวจ prize support", assignedTo: "staff-beam", status: "completed", startedAt: "14:30", completedAt: "14:50", dueAt: "15:00", note: "ครบ", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-close-orders", category: "ก่อนปิดร้าน", title: "เคลียร์ออเดอร์ค้าง", description: "ตรวจ paid-not-shipped และ pending slip", assignedTo: "staff-nam", status: "not_started", dueAt: "21:00", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-close-cash", category: "ก่อนปิดร้าน", title: "สรุปยอดขายและเงินสด", description: "สรุปยอดทุกช่องทาง", assignedTo: "staff-may", status: "not_started", dueAt: "21:30", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-close-stock", category: "ก่อนปิดร้าน", title: "ล็อกตู้สินค้าแพง", description: "ตรวจตู้และล็อกก่อนปิดร้าน", assignedTo: "staff-art", status: "not_started", dueAt: "21:30", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-close-report", category: "ปิดร้าน", title: "ส่งรายงานปิดร้าน", description: "ส่งยอดขาย ปัญหา และงานต่อพรุ่งนี้", assignedTo: "staff-may", status: "not_started", dueAt: "22:00", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-close-lock", category: "ปิดร้าน", title: "ล็อกร้านและยืนยันรูป", description: "ปิดไฟ แอร์ ประตู และส่งรูป", assignedTo: "staff-art", status: "not_started", dueAt: "22:30", note: "", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-cash-diff", category: "งานขายหน้าร้าน", title: "ตรวจยอดเงินส่วนต่าง", description: "เช็กยอดเงินสดและโอน", assignedTo: "staff-may", status: "late", startedAt: "15:00", dueAt: "15:15", note: "รอตรวจบิลยกเลิก", adminReviewStatus: "waiting_review", followUp: false }
  ],
  orders: [
    { id: "ORD-240704-001", customerName: "คุณพี", channel: "front_store", total: 2450, paymentStatus: "paid", packingStatus: "packed", shippingStatus: "not_ready", assignedTo: "staff-may", updatedAt: "10:20", note: "รับหน้าร้าน", issueFlag: false },
    { id: "ORD-240704-014", customerName: "คุณกัน", channel: "shopee", total: 1890, paymentStatus: "paid", packingStatus: "waiting", shippingStatus: "missing_tracking", assignedTo: "staff-nam", updatedAt: "14:40", note: "รอเลข tracking", issueFlag: true },
    { id: "ORD-240704-021", customerName: "คุณฟ้า", channel: "line", total: 4500, paymentStatus: "pending_slip", packingStatus: "waiting", shippingStatus: "not_ready", assignedTo: "staff-beam", updatedAt: "15:02", note: "รอตรวจสลิป", issueFlag: true },
    { id: "ORD-240704-028", customerName: "คุณเจ", channel: "facebook", total: 3200, paymentStatus: "paid", packingStatus: "packed", shippingStatus: "shipped", trackingNumber: "TH24070428", assignedTo: "staff-nam", updatedAt: "15:10", note: "ส่งแล้ว", issueFlag: false }
  ],
  shipments: [
    { orderId: "ORD-240704-014", carrier: "Kerry", status: "missing_tracking" },
    { orderId: "ORD-240704-028", carrier: "Flash", trackingNumber: "TH24070428", status: "shipped" }
  ],
  saleSummary: {
    grossSales: 86810.87,
    discount: -3031.6,
    cancelled: -1150,
    serviceCharge: 0,
    shippingFee: 0,
    tax: 5784.13,
    netSales: 88413.4,
    frontStoreSales: 42003.4,
    onlineSales: 46410,
    orderCount: 183,
    averageOrderValue: 483.13,
    openingChange: 5000,
    cashRemaining: 4775,
    expectedCash: 4775,
    cashDifference: 0,
    moneyStatus: "matched",
    payments: [
      { method: "cash", amount: 4775 },
      { method: "transfer", amount: 46800 },
      { method: "qr", amount: 31200 },
      { method: "card", amount: 5638.4 }
    ],
    hourlySales: [
      { hour: "08", amount: 3200 },
      { hour: "09", amount: 3600 },
      { hour: "10", amount: 4900 },
      { hour: "11", amount: 8100 },
      { hour: "12", amount: 7800 },
      { hour: "13", amount: 11900 },
      { hour: "14", amount: 11200 },
      { hour: "15", amount: 13600 },
      { hour: "16", amount: 4500 },
      { hour: "17", amount: 5900 },
      { hour: "18", amount: 13800 }
    ]
  },
  stockItems: [
    { id: "stock-pokemon-box", name: "Pokemon Booster Box", category: "Booster", remaining: 3, status: "low", estimatedValue: 13500, lastCheckedBy: "staff-art", updatedAt: "14:30", note: "ต้องเติมก่อน weekend" },
    { id: "stock-op09", name: "One Piece OP-09 Pack", category: "Booster", remaining: 0, status: "out", estimatedValue: 0, lastCheckedBy: "staff-art", updatedAt: "14:45", note: "หมดแล้ว" },
    { id: "stock-sleeve", name: "Premium Sleeve", category: "Accessory", remaining: 8, status: "restock", estimatedValue: 2400, lastCheckedBy: "staff-art", updatedAt: "15:00", note: "ขายดี" },
    { id: "stock-deckbox", name: "Deck Box Black", category: "Accessory", remaining: 12, status: "normal", estimatedValue: 3600, lastCheckedBy: "staff-art", updatedAt: "14:50", note: "" },
    { id: "stock-damaged", name: "Booster กล่องบุบ", category: "Damage", remaining: 1, status: "damaged", estimatedValue: 1200, lastCheckedBy: "staff-may", updatedAt: "13:20", note: "ถ่ายรูปแล้ว" },
    { id: "stock-missing", name: "Single Card Binder Slot 12", category: "Single", remaining: 0, status: "lost", estimatedValue: 2500, lastCheckedBy: "staff-art", updatedAt: "15:05", note: "ต้องตรวจกล้อง" },
    { id: "stock-tournament", name: "Event Entry Pack", category: "Event", remaining: 4, status: "low", estimatedValue: 1600, lastCheckedBy: "staff-beam", updatedAt: "15:15", note: "ใช้เย็นนี้" }
  ],
  highValueCards: [
    { id: "card-zard", name: "Charizard SAR PSA 10", category: "Pokemon", status: "showcase", estimatedValue: 42000, lastCheckedBy: "staff-art", updatedAt: "13:40", note: "อยู่ตู้บน" },
    { id: "card-luffy", name: "Manga Luffy", category: "One Piece", status: "reserved", estimatedValue: 39000, lastCheckedBy: "staff-may", updatedAt: "12:15", note: "ลูกค้ามัดจำแล้ว" },
    { id: "card-yugi", name: "Blue-Eyes QCR", category: "Yu-Gi-Oh!", status: "changed_today", estimatedValue: 18000, lastCheckedBy: "staff-art", updatedAt: "14:10", note: "ย้ายตู้" }
  ],
  issues: [
    { id: "issue-missing-tracking", title: "ออเดอร์ Shopee ยังไม่มี tracking", detail: "มี 4 ออเดอร์ที่แพ็กแล้วแต่ยังไม่ได้ใส่ tracking", severity: "high", assignedTo: "staff-nam", status: "open", createdAt: "14:45", deadline: "17:00", notes: ["ตามรอบขนส่ง"] },
    { id: "issue-showcase-photo", title: "รูปตู้โชว์ไม่ครบ", detail: "Checklist ตรวจตู้การ์ดแพงขาดรูปชั้นล่าง", severity: "medium", assignedTo: "staff-art", status: "open", createdAt: "14:05", deadline: "16:00", notes: [] },
    { id: "issue-line-reply", title: "ลูกค้า LINE รอคำตอบ", detail: "ลูกค้าขอราคาการ์ด Single 2 ราย", severity: "medium", assignedTo: "staff-beam", status: "in_progress", createdAt: "15:00", deadline: "16:30", notes: ["รอตรวจราคากับ manager"] },
    { id: "issue-stock-missing", title: "Single Card หายจาก Binder", detail: "ช่อง 12 ไม่ตรงกับระบบ", severity: "urgent", assignedTo: "staff-art", status: "waiting_review", createdAt: "15:05", deadline: "15:45", notes: ["ต้องตรวจกล้อง"] },
    { id: "issue-close-report", title: "รอส่งรายงานปิดร้าน", detail: "ต้อง follow up ตอนปิดร้าน", severity: "low", assignedTo: "staff-may", status: "open", createdAt: "15:20", deadline: "22:00", notes: [] }
  ],
  adminReviews: [
    { id: "review-1", targetType: "checklist", targetId: "check-open-lights", status: "approved", reviewerId: "owner-1", note: "ครบ", updatedAt: "10:00" }
  ],
  auditLogs: [
    { id: "audit-1", timestamp: "09:02", actor: "staff-may", action: "complete_checklist", targetType: "checklist", targetId: "check-open-lights", before: "in_progress", after: "completed", detail: "เปิดระบบร้านครบ" },
    { id: "audit-2", timestamp: "14:45", actor: "staff-nam", action: "report_issue", targetType: "issue", targetId: "issue-missing-tracking", before: "none", after: "open", detail: "ยังไม่มี tracking" }
  ]
};
```

- [ ] **Step 2: Create pure store functions**

Create `lib/admin-dashboard-store.ts`:

```ts
import type {
  AdminDashboardState,
  AdminReviewStatus,
  AuditLog,
  ChecklistItem,
  Issue,
  IssueStatus
} from "./admin-dashboard-data.ts";

export type AdminDashboardSummary = {
  totalChecklist: number;
  completedChecklist: number;
  pendingChecklist: number;
  lateChecklist: number;
  pendingOrders: number;
  issueCount: number;
  stockAlerts: number;
  staffOnline: number;
  completionRate: number;
};

function audit(actor: string, action: string, targetType: string, targetId: string, before: string, after: string, detail: string): AuditLog {
  return {
    id: `audit-${action}-${targetId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    targetType,
    targetId,
    before,
    after,
    detail
  };
}

function updateChecklistItem(
  state: AdminDashboardState,
  itemId: string,
  actorId: string,
  action: string,
  detail: string,
  update: (item: ChecklistItem) => ChecklistItem
) {
  let before = "";
  let after = "";
  const checklistItems = state.checklistItems.map((item) => {
    if (item.id !== itemId) return item;
    before = item.adminReviewStatus;
    const next = update(item);
    after = next.adminReviewStatus;
    return next;
  });

  return {
    ...state,
    checklistItems,
    auditLogs: [...state.auditLogs, audit(actorId, action, "checklist", itemId, before, after, detail)]
  };
}

function updateIssue(
  state: AdminDashboardState,
  issueId: string,
  actorId: string,
  action: string,
  detail: string,
  update: (issue: Issue) => Issue
) {
  let before = "";
  let after = "";
  const issues = state.issues.map((issue) => {
    if (issue.id !== issueId) return issue;
    before = `${issue.status}:${issue.assignedTo}`;
    const next = update(issue);
    after = `${next.status}:${next.assignedTo}`;
    return next;
  });

  return {
    ...state,
    issues,
    auditLogs: [...state.auditLogs, audit(actorId, action, "issue", issueId, before, after, detail)]
  };
}

export function getAdminDashboardState(state: AdminDashboardState) {
  return state;
}

export function getAdminDashboardSummary(state: AdminDashboardState): AdminDashboardSummary {
  const totalChecklist = state.checklistItems.length;
  const completedChecklist = state.checklistItems.filter((item) => item.status === "completed").length;
  const lateChecklist = state.checklistItems.filter((item) => item.status === "late" || item.status === "issue").length;
  const pendingChecklist = totalChecklist - completedChecklist;
  const pendingOrders = state.orders.filter(
    (order) =>
      order.paymentStatus !== "paid" ||
      order.packingStatus === "waiting" ||
      order.shippingStatus === "missing_tracking" ||
      order.shippingStatus === "problem"
  ).length + 4;
  const issueCount = state.issues.filter((issue) => issue.status !== "closed").length;
  const stockAlerts = state.stockItems.filter((item) => item.status !== "normal").length;
  const staffOnline = state.staff.filter((staff) => staff.status !== "shift_closed").length;

  return {
    totalChecklist,
    completedChecklist,
    pendingChecklist,
    lateChecklist,
    pendingOrders,
    issueCount,
    stockAlerts,
    staffOnline,
    completionRate: totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0
  };
}

export function updateChecklistStatus(state: AdminDashboardState, itemId: string, status: ChecklistItem["status"], actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "update_checklist_status", `เปลี่ยนสถานะเป็น ${status}`, (item) => ({
    ...item,
    status
  }));
}

export function approveChecklistItem(state: AdminDashboardState, itemId: string, actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "approve_checklist", "อนุมัติ checklist", (item) => ({
    ...item,
    adminReviewStatus: "approved",
    correctionReason: undefined,
    followUp: false
  }));
}

export function requestCorrection(state: AdminDashboardState, itemId: string, actorId: string, reason: string) {
  return updateChecklistItem(state, itemId, actorId, "request_correction", reason, (item) => ({
    ...item,
    adminReviewStatus: "correction_requested",
    correctionReason: reason,
    followUp: true
  }));
}

export function markChecklistFollowUp(state: AdminDashboardState, itemId: string, actorId: string) {
  return updateChecklistItem(state, itemId, actorId, "mark_follow_up", "ทำเครื่องหมาย follow up", (item) => ({
    ...item,
    adminReviewStatus: "follow_up_required",
    followUp: true
  }));
}

export function createIssue(state: AdminDashboardState, issue: Issue, actorId: string) {
  return {
    ...state,
    issues: [...state.issues, issue],
    auditLogs: [...state.auditLogs, audit(actorId, "create_issue", "issue", issue.id, "none", issue.status, issue.title)]
  };
}

export function assignIssue(state: AdminDashboardState, issueId: string, assignedTo: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "assign_issue", `มอบหมายให้ ${assignedTo}`, (issue) => ({
    ...issue,
    assignedTo,
    status: issue.status === "open" ? "in_progress" : issue.status
  }));
}

export function resolveIssue(state: AdminDashboardState, issueId: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "resolve_issue", "ปิด issue", (issue) => ({
    ...issue,
    status: "closed" as IssueStatus,
    notes: [...issue.notes, "Resolved by admin"]
  }));
}

export function addIssueNote(state: AdminDashboardState, issueId: string, note: string, actorId: string) {
  return updateIssue(state, issueId, actorId, "add_issue_note", note, (issue) => ({
    ...issue,
    notes: [...issue.notes, note]
  }));
}

export function approveDailyClosing(state: AdminDashboardState, actorId: string) {
  return {
    ...state,
    adminReviews: [
      ...state.adminReviews,
      {
        id: `review-closing-${Date.now()}`,
        targetType: "closing",
        targetId: state.workDate,
        status: "approved" as AdminReviewStatus,
        reviewerId: actorId,
        note: "อนุมัติปิดยอดประจำวัน",
        updatedAt: new Date().toISOString()
      }
    ],
    auditLogs: [...state.auditLogs, audit(actorId, "approve_daily_closing", "closing", state.workDate, "waiting_review", "approved", "อนุมัติปิดยอดประจำวัน")]
  };
}
```

- [ ] **Step 3: Run tests to verify green**

Run:

```bash
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm test -- tests/admin-dashboard-store.test.ts
```

Expected: PASS for `admin dashboard store`.

---

### Task 3: Admin Route And Dashboard Component

**Files:**
- Create: `components/AdminOpsDashboard.tsx`
- Create: `app/(dashboard)/admin/ops/page.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Add dashboard component**

Create `components/AdminOpsDashboard.tsx` as a client component that imports the mock state, calls the service functions, and renders all required sections. Use the action handlers below:

```ts
"use client";

import { useMemo, useState } from "react";
import { mockAdminDashboardState, type AdminDashboardState, type ChecklistItem, type Issue, type Order, type Staff } from "../lib/admin-dashboard-data.ts";
import {
  approveChecklistItem,
  assignIssue,
  getAdminDashboardSummary,
  markChecklistFollowUp,
  requestCorrection,
  resolveIssue
} from "../lib/admin-dashboard-store.ts";

type DrawerItem =
  | { type: "staff"; item: Staff }
  | { type: "checklist"; item: ChecklistItem }
  | { type: "order"; item: Order }
  | { type: "issue"; item: Issue }
  | null;

const actorId = "owner-1";

function money(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}
```

The component must include:

- State:
  - `state`
  - `query`
  - `statusFilter`
  - `staffFilter`
  - `drawer`
- Derived values:
  - `summary`
  - filtered checklist rows
  - filtered orders
  - open issues
- Handlers:
  - `handleApproveChecklist`
  - `handleCorrection`
  - `handleFollowUp`
  - `handleAssignIssue`
  - `handleResolveIssue`

Use Thai labels and FoodStory-like cards. The root element class must be `admin-ops`.

- [ ] **Step 2: Add route page**

Create `app/(dashboard)/admin/ops/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AdminOpsDashboard } from "../../../../components/AdminOpsDashboard.tsx";
import { requireUser } from "../../../../lib/auth.ts";
import { isPreviewMode } from "../../../../lib/preview-data.ts";

export default async function AdminOpsPage() {
  const user = await requireUser();
  if (user.role !== "admin" && !isPreviewMode()) redirect("/");

  return <AdminOpsDashboard />;
}
```

- [ ] **Step 3: Add admin navigation link**

Modify `components/AppShell.tsx` so `adminLinks` includes:

```ts
{ href: "/admin/ops", label: "Owner Summary" },
```

Place it before `Review`.

- [ ] **Step 4: Run type check**

Run:

```bash
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run lint
```

Expected: PASS.

---

### Task 4: FoodStory-Inspired Styling

**Files:**
- Modify: `app/globals.css`
- Component classes from: `components/AdminOpsDashboard.tsx`

- [ ] **Step 1: Add admin dashboard CSS**

Append styles for:

- `.admin-ops`
- `.admin-owner-shell`
- `.admin-owner-sidebar`
- `.admin-owner-content`
- `.admin-owner-topbar`
- `.admin-filter-card`
- `.admin-report-grid`
- `.admin-sales-card`
- `.admin-card`
- `.admin-metric-grid`
- `.admin-chart-card`
- `.admin-table`
- `.admin-status`
- `.admin-drawer-backdrop`
- `.admin-drawer`
- Responsive breakpoint at `max-width: 980px`

Use these design constants:

```css
background: #eef0f3;
card background: #fff;
border: #e0e5ea;
text: #30343b;
muted: #6f7782;
teal action: #55bfd1;
green success: #72c657;
orange chart: #f4b866;
red danger: #e05b4f;
blue progress: #4b8fea;
gray idle: #8d96a0;
radius: 8px;
```

- [ ] **Step 2: Verify responsive layout manually**

Run dev server:

```bash
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run dev
```

Expected: server starts and prints a local URL.

Open:

```text
http://localhost:3000/admin/ops
```

Check desktop and tablet widths. Expected:

- Sidebar remains usable.
- Summary cards do not overlap.
- Tables scroll horizontally if needed.
- Drawer fits within viewport.

---

### Task 5: Interaction Verification And Final Checks

**Files:**
- `components/AdminOpsDashboard.tsx`
- `lib/admin-dashboard-store.ts`
- `tests/admin-dashboard-store.test.ts`

- [ ] **Step 1: Verify interactive actions in browser**

At `http://localhost:3000/admin/ops`, perform:

- Click checklist row detail.
- Click `Approve`; expected badge changes to approved and audit log gets a new row.
- Click `Request Correction`; expected badge changes to correction requested and drawer/detail shows reason.
- Click `Follow Up`; expected row appears in follow-up queue.
- Click issue detail.
- Click `Assign`; expected assignee changes.
- Click `Resolve`; expected issue status changes to closed.
- Type search text; expected checklist/orders/issues filter.

- [ ] **Step 2: Run automated checks**

Run:

```bash
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm test
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run lint
env PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm run build
```

Expected:

- `npm test`: all tests pass.
- `npm run lint`: TypeScript exits 0.
- `npm run build`: Next.js build exits 0.

- [ ] **Step 3: Final response**

Report:

- The route: `http://localhost:3000/admin/ops`.
- Files created/modified.
- Test/build results.
- Short explanation of Staff/Admin connection:
  - Staff Checklist writes workflow/checklist/order/issue state.
  - Admin Dashboard reads the shared operational state.
  - Admin review actions write back review/correction/follow-up status.
