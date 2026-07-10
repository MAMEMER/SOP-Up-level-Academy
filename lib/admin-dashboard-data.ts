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
  pendingOrderCount: number;
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

export type FinishTask = {
  id: string;
  title: string;
  schedule: "daily" | "weekly" | "monthly";
  dueLabel: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  owner: string;
  category: string;
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
  finishTasks: FinishTask[];
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
    { id: "check-online-replies", category: "งานแอดมินออนไลน์", title: "ตอบข้อความค้างทุกช่องทาง", description: "Facebook, LINE, Shopee, TikTok, Instagram", assignedTo: "staff-beam", status: "completed", startedAt: "10:00", completedAt: "15:05", dueAt: "15:00", evidence: "แคปหน้าจอ inbox", note: "เหลือลูกค้า LINE 2 ราย", adminReviewStatus: "waiting_review", followUp: false },
    { id: "check-order-slip", category: "งานขายหน้าร้าน", title: "ตรวจสลิปโอน", description: "ตรวจยอดโอนและจับคู่กับออเดอร์", assignedTo: "staff-may", status: "completed", startedAt: "11:00", completedAt: "11:20", dueAt: "12:00", evidence: "ยอด QR 31,600", note: "ตรง", adminReviewStatus: "approved", followUp: false },
    { id: "check-stock-showcase", category: "งานสต๊อก", title: "ตรวจตู้การ์ดมูลค่าสูง", description: "เช็กการ์ดโชว์เคสและสถานะจอง", assignedTo: "staff-art", status: "completed", startedAt: "13:30", completedAt: "14:05", dueAt: "14:00", evidence: "รูปตู้โชว์บางส่วน", note: "ขาดรูปชั้นล่าง", adminReviewStatus: "waiting_review", followUp: false },
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
    pendingOrderCount: 8,
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
    { id: "stock-deckbox", name: "Deck Box Black", category: "Accessory", remaining: 12, status: "low", estimatedValue: 3600, lastCheckedBy: "staff-art", updatedAt: "14:50", note: "ต้องเติมสีอื่น" },
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
  ],
  finishTasks: [
    { id: "daily-open", title: "เปิดร้านและตรวจระบบขาย", schedule: "daily", dueLabel: "วันนี้", dueDate: "2026-07-04", completed: true, completedAt: "09:28", owner: "staff-may", category: "Daily" },
    { id: "daily-stock", title: "ตรวจ Stock และ StoreHub", schedule: "daily", dueLabel: "วันนี้", dueDate: "2026-07-04", completed: false, owner: "staff-art", category: "Daily" },
    { id: "daily-shipping", title: "เคลียร์ออเดอร์จัดส่ง", schedule: "daily", dueLabel: "วันนี้", dueDate: "2026-07-04", completed: false, owner: "staff-nam", category: "Daily" },
    { id: "weekly-sleeve", title: "นับ Sleeve / อุปกรณ์ทั้งหมด", schedule: "weekly", dueLabel: "ครบกำหนดสัปดาห์นี้", dueDate: "2026-07-07", completed: false, owner: "staff-art", category: "Weekly" },
    { id: "weekly-booster", title: "นับ Booster box / Box all cards", schedule: "weekly", dueLabel: "ครบกำหนดสัปดาห์นี้", dueDate: "2026-07-08", completed: true, completedAt: "11:30", owner: "staff-may", category: "Weekly" },
    { id: "monthly-stock", title: "นับ Stock รวมประจำเดือน", schedule: "monthly", dueLabel: "ครบกำหนดเดือนนี้", dueDate: "2026-07-28", completed: false, owner: "staff-art", category: "Monthly" },
    { id: "monthly-single", title: "นับ Single card แยกแฟ้ม", schedule: "monthly", dueLabel: "ครบกำหนดเดือนนี้", dueDate: "2026-07-29", completed: false, owner: "staff-beam", category: "Monthly" },
    { id: "monthly-diff", title: "สรุปยอดต่างและรายการปรับ StoreHub", schedule: "monthly", dueLabel: "ครบกำหนดเดือนนี้", dueDate: "2026-07-30", completed: false, owner: "staff-may", category: "Monthly" }
  ]
};
