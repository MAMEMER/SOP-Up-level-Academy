import { previewAdminSops } from "./preview-sops-admin.ts";

export type PreviewUser = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "leader" | "admin";
  departmentId: string | null;
};

export type PreviewDepartment = {
  id: string;
  name: string;
  display_name: string;
};

export type PreviewProfile = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "leader" | "admin";
  department_id: string | null;
  active: boolean;
  departments: Array<{ display_name: string }> | null;
};

export type PreviewSop = {
  id: string;
  title: string;
  status: "draft" | "pending_approval" | "published" | "needs_revision";
  department_id: string;
  created_by: string;
  purpose: string;
  when_to_use: string;
  responsible_role: string;
  required_tools: string;
  precautions: string;
  faq: string;
  tags: string[];
  updated_at: string;
  created_at: string;
  departments: Array<{ display_name: string }> | null;
  sop_steps: Array<{
    id: string;
    step_order: number;
    title: string;
    body: string;
    checklist_items?: string[];
    duration_minutes?: number;
  }>;
};

export type PreviewTaskAssignment = {
  id: string;
  sop_id: string;
  assigned_to: string;
  assigned_by: string;
  work_date: string;
  required: boolean;
  sops?: any[] | null;
  profiles?: Array<{ name: string; email: string }> | null;
  assigned_profile?: Array<{ name: string; email: string }> | null;
};

export type PreviewTaskRun = {
  id: string;
  assignment_id: string;
  user_id: string;
  status: "not_started" | "in_progress" | "completed";
  started_at: string;
  completed_at: string | null;
  due_seconds: number;
  completed_checklist: number;
  total_checklist: number;
};

export type PreviewLoginEvent = {
  id: string;
  user_id: string;
  work_date: string;
  first_seen_at: string;
  last_seen_at: string;
};

export const previewUser: PreviewUser = {
  id: "preview-admin-champ",
  name: "Champ Master",
  email: "champ.championest@gmail.com",
  role: "admin",
  departmentId: "admin"
};

export const previewLoginEmailCookieName = "sop_uplevel_preview_email";

export const previewDepartments: PreviewDepartment[] = [
  { id: "front-store", name: "front-store", display_name: "หน้าร้าน" },
  { id: "stock", name: "stock", display_name: "Stock" },
  { id: "admin", name: "admin", display_name: "แอดมิน" },
  { id: "accounting", name: "accounting", display_name: "บัญชี" }
];

export const previewProfiles: PreviewProfile[] = [
  {
    id: "preview-user",
    name: "Preview Leader",
    email: "preview@company.com",
    role: "leader",
    department_id: "front-store",
    active: true,
    departments: [{ display_name: "หน้าร้าน" }]
  },
  {
    id: "preview-admin",
    name: "Namen RW",
    email: "namenrw@gmail.com",
    role: "admin",
    department_id: "admin",
    active: true,
    departments: [{ display_name: "แอดมิน" }]
  },
  {
    id: "preview-admin-champ",
    name: "Champ Master",
    email: "champ.championest@gmail.com",
    role: "admin",
    department_id: "admin",
    active: true,
    departments: [{ display_name: "แอดมิน" }]
  },
  {
    id: "staff-boom",
    name: "บูม",
    email: "boomboom08755@gmail.com",
    role: "employee",
    department_id: "front-store",
    active: true,
    departments: [{ display_name: "หน้าร้าน" }]
  },
  {
    id: "staff-ice",
    name: "ไอซ์",
    email: "phooreephat.k@gmail.com",
    role: "employee",
    department_id: "front-store",
    active: true,
    departments: [{ display_name: "หน้าร้าน" }]
  },
  {
    id: "staff-leo",
    name: "ลีโอ",
    email: "nuslove2560@gmail.com",
    role: "employee",
    department_id: "front-store",
    active: true,
    departments: [{ display_name: "หน้าร้าน" }]
  }
];

export function previewProfileForEmail(email: string | null | undefined) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existingProfile = previewProfiles.find((profile) => profile.email.toLowerCase() === normalizedEmail && profile.active);
  if (existingProfile) return existingProfile;
  if (!normalizedEmail) return previewProfiles.find((profile) => profile.id === previewUser.id);
  return {
    id: `preview-email-${normalizedEmail.replace(/[^a-z0-9]+/g, "-")}`,
    name: normalizedEmail,
    email: normalizedEmail,
    role: "admin" as const,
    department_id: "admin",
    active: true,
    departments: [{ display_name: "แอดมิน" }]
  };
}

export const previewSops: PreviewSop[] = [
  {
    id: "preview-sop-1",
    title: "เปิดร้าน",
    status: "published",
    department_id: "front-store",
    created_by: "preview-user",
    purpose: "เตรียมร้านให้พร้อมขายก่อนลูกค้าคนแรกเข้าร้าน",
    when_to_use: "ก่อนเริ่มกะเปิดร้าน",
    responsible_role: "หัวหน้ากะ / พนักงานหน้าร้าน",
    required_tools: "กุญแจร้าน\nเครื่อง POS\nเงินสด\nรายการเปิดแอร์และไฟ\nกล้องสำหรับถ่ายรูปพร้อมเปิด",
    precautions: "ต้องเปิดแอร์และไฟก่อนร้านเปิด 15 นาที และต้องมีรูปยืนยันความพร้อมก่อนเริ่มบริการลูกค้า",
    faq: "ถ้าเงินสด ระบบ POS หรือเรื่อง Stock ไม่พร้อม ให้แจ้งหัวหน้าก่อนเปิดขายทันที",
    tags: ["เปิดร้าน", "หน้าร้าน", "กะเปิด"],
    updated_at: "2026-07-01T09:00:00Z",
    created_at: "2026-06-30T09:00:00Z",
    departments: [{ display_name: "หน้าร้าน" }],
    sop_steps: [
      {
        id: "step-1",
        step_order: 1,
        title: "ก่อนเปิดร้าน",
        body: "เตรียมร้านให้พร้อมก่อนเปิดบริการลูกค้า",
        duration_minutes: 15,
        checklist_items: [
          "เช็คความสะอาด",
          "เปิดแอร์และไฟตามจุดที่ใช้งาน ก่อนร้านเปิด 15 นาที",
          "ถ่ายรูปสภาพร้านพร้อมเปิดสำหรับบริการลูกค้า",
          "ตรวจเช็คเงินสด",
          "เปิดเครื่อง POS",
          "ดำเนินการต่อเรื่อง Stock"
        ]
      }
    ]
  },
  {
    id: "preview-sop-11",
    title: "ระหว่างวัน",
    status: "published",
    department_id: "front-store",
    created_by: "preview-user",
    purpose: "ติดตามงานหน้าร้านระหว่างวันให้ไม่หลุดและแก้ปัญหาเงินสดได้ทันที",
    when_to_use: "ระหว่างกะทำงานหน้าร้าน",
    responsible_role: "พนักงานหน้าร้าน / หัวหน้ากะ",
    required_tools: "รายงานยอดเงินเมื่อวาน\nเครื่อง POS\nรายการงานที่หัวหน้ามอบหมาย\nระบบ UPMAN",
    precautions: "งานที่ได้รับมอบหมายจากหัวหน้าต้องมีเจ้าของงานและกำหนดระยะเวลา ไม่ควรเกิน 3 วัน",
    faq: "ถ้าเงินไม่ตรงกับปิดยอดเมื่อวาน ให้ตรวจสอบก่อนเริ่มแก้ยอดและแจ้งหัวหน้าทันที",
    tags: ["ระหว่างวัน", "หน้าร้าน", "งานมอบหมาย"],
    updated_at: "2026-07-04T10:00:00Z",
    created_at: "2026-07-04T10:00:00Z",
    departments: [{ display_name: "หน้าร้าน" }],
    sop_steps: [
      {
        id: "daily-front-1",
        step_order: 1,
        title: "ระหว่างวัน",
        body: "ตรวจงานสำคัญที่เกิดขึ้นระหว่างกะ",
        duration_minutes: 20,
        checklist_items: [
          "ตรวจสอบยอดเงินกรณีเงินไม่ตรงกับปิดยอดเมื่อวาน",
          "ตรวจงานที่ได้รับมอบหมายจากหัวหน้างาน",
          "ยืนยันกำหนดระยะเวลาของงานที่ได้รับมอบหมาย",
          "แจ้งหัวหน้าหากงานมีแนวโน้มเกิน 3 วัน"
        ]
      }
    ]
  },
  {
    id: "preview-sop-10",
    title: "ปิดร้าน",
    status: "published",
    department_id: "front-store",
    created_by: "preview-user",
    purpose: "ปิดรอบขาย เก็บเงิน ทำความสะอาด และล็อกร้านให้ปลอดภัย",
    when_to_use: "หลังจบกะปิดร้าน",
    responsible_role: "หัวหน้ากะ / พนักงานปิดร้าน",
    required_tools: "รายงาน POS\nเงินสด\nแบบฟอร์มรายงานปิดร้าน\nถุงขยะและอุปกรณ์ทำความสะอาด\nกุญแจร้าน",
    precautions: "ยอดเงิน ประตู กุญแจ ไฟ และอุปกรณ์ไฟฟ้าต้องตรวจซ้ำก่อนออกจากร้าน",
    faq: "ถ้ายอดเงินไม่ตรง ให้หยุดปิดยอดและแจ้งหัวหน้าทันที ห้ามปรับยอดเองโดยไม่มีผู้อนุมัติ",
    tags: ["ปิดร้าน", "หน้าร้าน", "กะปิด"],
    updated_at: "2026-07-01T09:05:00Z",
    created_at: "2026-06-30T09:05:00Z",
    departments: [{ display_name: "หน้าร้าน" }],
    sop_steps: [
      {
        id: "close-step-1",
        step_order: 1,
        title: "เฟส 1",
        body: "เตรียมพื้นที่และแจ้งลูกค้าก่อนปิดร้าน",
        duration_minutes: 30,
        checklist_items: [
          "แจ้งลูกค้าหน้าร้านก่อนปิด 30 นาที",
          "จัดเก็บอุปกรณ์เข้าที่ให้เรียบร้อย",
          "ทำความสะอาดพื้นที่เล่น",
          "ทำความสะอาดพื้นที่หน้าร้าน"
        ]
      },
      {
        id: "close-step-2",
        step_order: 2,
        title: "เฟส 2",
        body: "ปิดยอด ปิดระบบ และออกจากระบบหลังตรวจความปลอดภัย",
        duration_minutes: 20,
        checklist_items: [
          "ตรวจนับเงินสด / โอน / บัตร ให้ตรง",
          "ปิดรอบการขายใน POS",
          "ส่งรายงานปิดร้านให้หัวหน้าและอัปโหลดรูปลงระบบ",
          "ปิดเครื่องใช้ไฟฟ้าทุกอย่างที่ไม่จำเป็น",
          "ล็อคประตูและตรวจสอบอีกครั้ง",
          "Lock out ออกจากระบบ UPMAN"
        ]
      }
    ]
  },
  {
    id: "preview-sop-2",
    title: "การจัดการ Stock ประจำวัน",
    status: "published",
    department_id: "stock",
    created_by: "preview-user",
    purpose: "ควบคุมจำนวนสินค้าให้ตรงระบบ ลดของหาย ของซ้ำ และสินค้าค้างสต็อก",
    when_to_use: "ทุกวันที่มีการรับของ เติมของ ย้ายของ ตรวจนับ หรือพบสต็อกไม่ตรง",
    responsible_role: "สต็อกลีด / พนักงาน Stock",
    required_tools: "ใบส่งของหรือใบรับสินค้า\nเครื่องสแกนหรือระบบ POS\nปากกาและสติกเกอร์ระบุหมวด\nกล่องแยกสินค้าเสียหาย\nแบบฟอร์มรายงานสต็อก",
    precautions: "ห้ามลงจำนวนในระบบก่อนตรวจสินค้าจริง ห้ามวางสินค้ารอโดยไม่ติดป้าย และต้องรายงานทันทีเมื่อจำนวนไม่ตรง",
    faq: "ถ้าระบบกับของจริงไม่ตรง ให้หยุดปรับยอดเอง ถ่ายรูปหลักฐาน ตรวจเอกสารรับเข้า-ขายออก แล้วแจ้งหัวหน้าก่อนแก้ไข",
    tags: ["stock", "รับสินค้า", "ตรวจนับ", "เติมสินค้า"],
    updated_at: "2026-07-01T10:00:00Z",
    created_at: "2026-07-01T08:00:00Z",
    departments: [{ display_name: "Stock" }],
    sop_steps: [
      {
        id: "stock-step-1",
        step_order: 1,
        title: "รับสินค้าเข้า",
        body: "ตรวจของจริงกับเอกสารก่อนบันทึกเข้าระบบ",
        duration_minutes: 20,
        checklist_items: [
          "นับจำนวนสินค้าจริงเทียบกับใบส่งของ",
          "ตรวจชื่อสินค้า SKU รุ่น ภาษา และราคาให้ตรง",
          "แยกสินค้าชำรุด กล่องบุบ หรือรายการที่ไม่ตรงเอกสาร",
          "ถ่ายรูปหลักฐานเมื่อจำนวนหรือสภาพสินค้าไม่ถูกต้อง"
        ]
      },
      {
        id: "stock-step-2",
        step_order: 2,
        title: "บันทึกเข้าระบบ",
        body: "อัปเดตสต็อกหลังตรวจของจริงครบแล้วเท่านั้น",
        duration_minutes: 15,
        checklist_items: [
          "สแกนหรือค้น SKU ให้ถูกก่อนเพิ่มจำนวน",
          "กรอกจำนวนรับเข้าให้ตรงกับของที่ตรวจแล้ว",
          "ใส่ต้นทุนหรือหมายเหตุล็อตสินค้าเมื่อมีข้อมูล",
          "ตรวจยอดหลังบันทึกว่าเพิ่มถูกตำแหน่งและถูกสินค้า"
        ]
      },
      {
        id: "stock-step-3",
        step_order: 3,
        title: "จัดเก็บเข้าที่",
        body: "จัดสินค้าให้ค้นง่าย หยิบถูก และลดความเสียหาย",
        duration_minutes: 20,
        checklist_items: [
          "แยกสินค้าตามหมวด เกม รุ่น หรือประเภทสินค้า",
          "ติดป้ายตำแหน่งหรือกล่องเก็บให้ชัดเจน",
          "วางสินค้าขายดีกับสินค้าที่ต้องเติมบ่อยไว้ในจุดหยิบง่าย",
          "เก็บสินค้าราคาแพงหรือจำนวนจำกัดในพื้นที่ควบคุม"
        ]
      },
      {
        id: "stock-step-4",
        step_order: 4,
        title: "เติมหน้าร้าน",
        body: "เติมสินค้าที่พร้อมขายโดยไม่ทำให้ยอดหลังบ้านผิด",
        duration_minutes: 15,
        checklist_items: [
          "ตรวจรายการสินค้าหน้าร้านที่ต่ำกว่าจุดขั้นต่ำ",
          "หยิบสินค้าจากหลังร้านตามจำนวนที่ต้องเติมจริง",
          "จัดหน้าชั้นให้ป้ายราคาและสินค้าตรงกัน",
          "บันทึกการย้ายจุดเก็บถ้าระบบแยกคลังหรือแยกพื้นที่"
        ]
      },
      {
        id: "stock-step-5",
        step_order: 5,
        title: "ตรวจนับและรายงาน",
        body: "ตรวจยอดสำคัญทุกวันและส่งต่อปัญหาก่อนกระทบการขาย",
        duration_minutes: 20,
        checklist_items: [
          "สุ่มนับสินค้าขายดีหรือสินค้าราคาสูง",
          "เทียบยอดจริงกับยอดในระบบ",
          "บันทึกของหาย ของเสีย ของค้าง หรือสินค้าที่ใกล้หมด",
          "ส่งรายงานสรุปให้หัวหน้าพร้อมรายการที่ต้องสั่งเพิ่ม"
        ]
      }
    ]
  },
  ...previewAdminSops.slice(0, 1),
  {
    id: "preview-sop-5",
    title: "จัดงานแข่งและอีเวนต์การ์ด",
    status: "published",
    department_id: "front-store",
    created_by: "preview-user",
    purpose: "ทำให้งานแข่งเริ่มตรงเวลา เป็นธรรม และสร้างประสบการณ์ที่ดีให้ชุมชน",
    when_to_use: "ก่อน ระหว่าง และหลังทัวร์นาเมนต์หรือกิจกรรมในร้าน",
    responsible_role: "หัวหน้ากะ / Event lead",
    required_tools: "รายชื่อผู้สมัคร\nตาราง pairings\nรางวัล\nกติกางาน\nพื้นที่เล่น",
    precautions: "ต้องประกาศกติกา รางวัล และเวลารอบให้ชัดก่อนเริ่มงาน",
    faq: "หากมีข้อโต้แย้ง ให้หยุดรอบนั้นชั่วคราวและให้ Event lead ตัดสินตามกติกาที่ประกาศ",
    tags: ["event", "tournament", "ชุมชน"],
    updated_at: "2026-07-04T09:10:00Z",
    created_at: "2026-07-04T09:10:00Z",
    departments: [{ display_name: "หน้าร้าน" }],
    sop_steps: [
      {
        id: "event-1",
        step_order: 1,
        title: "เตรียมงานก่อนเริ่ม",
        body: "ตรวจคน พื้นที่ อุปกรณ์ และรางวัลก่อนประกาศเริ่ม",
        duration_minutes: 30,
        checklist_items: ["ยืนยันรายชื่อผู้เล่น", "จัดโต๊ะและเลขโต๊ะ", "เตรียมรางวัลและอุปกรณ์", "ประกาศกติกาและเวลา"]
      },
      {
        id: "event-2",
        step_order: 2,
        title: "คุมรอบการแข่งขัน",
        body: "ทำให้รอบเริ่มและจบตามเวลา",
        duration_minutes: 15,
        checklist_items: ["ประกาศ pairings", "จับเวลาแต่ละรอบ", "รับผลการแข่งขัน", "แก้ปัญหาหน้างานตามกติกา"]
      },
      {
        id: "event-3",
        step_order: 3,
        title: "ปิดงาน",
        body: "สรุปผล มอบรางวัล และเก็บพื้นที่",
        duration_minutes: 20,
        checklist_items: ["ตรวจอันดับสุดท้าย", "มอบรางวัล", "ถ่ายรูปหรือเก็บหลักฐาน", "เก็บโต๊ะและรายงานผล"]
      }
    ]
  },
  {
    id: "preview-sop-6",
    title: "จุดสั่งซื้อและเติมสินค้าขั้นต่ำ",
    status: "published",
    department_id: "stock",
    created_by: "preview-user",
    purpose: "ป้องกันสินค้าขายดีหมด และลดเงินจมในสินค้าที่หมุนช้า",
    when_to_use: "ทุกครั้งที่ตรวจ stock หรือก่อนส่งคำขอสั่งซื้อ",
    responsible_role: "Stock lead",
    required_tools: "รายงานยอดขาย\nยอดคงเหลือ\nรายการสินค้าขายดี\nแบบฟอร์มขอสั่งซื้อ",
    precautions: "ห้ามสั่งซื้อจากความรู้สึก ต้องดูยอดขายจริง ยอดคงเหลือ และรอบส่งของ",
    faq: "สินค้าขายช้าให้เสนอโปรโมชันหรือย้ายจุดวางก่อนสั่งเพิ่ม",
    tags: ["stock", "purchase", "reorder"],
    updated_at: "2026-07-04T09:20:00Z",
    created_at: "2026-07-04T09:20:00Z",
    departments: [{ display_name: "Stock" }],
    sop_steps: [
      {
        id: "reorder-1",
        step_order: 1,
        title: "ดูยอดขายและยอดคงเหลือ",
        body: "เลือกเฉพาะสินค้าที่ต้องตัดสินใจจริง",
        duration_minutes: 20,
        checklist_items: ["ดึงยอดขาย 7-30 วัน", "ดูยอดคงเหลือจริง", "แยกสินค้าขายดี", "แยกสินค้าหมุนช้า"]
      },
      {
        id: "reorder-2",
        step_order: 2,
        title: "กำหนดรายการสั่งซื้อ",
        body: "คำนวณจำนวนที่เหมาะสมก่อนส่งอนุมัติ",
        duration_minutes: 20,
        checklist_items: ["เทียบ lead time", "ตั้งจำนวนขั้นต่ำ", "คำนวณจำนวนสั่งเพิ่ม", "ระบุเหตุผลการสั่ง"]
      },
      {
        id: "reorder-3",
        step_order: 3,
        title: "ส่งอนุมัติ",
        body: "ส่งข้อมูลให้หัวหน้าตัดสินใจได้เร็ว",
        duration_minutes: 10,
        checklist_items: ["แนบยอดขาย", "แนบยอดคงเหลือ", "ระบุวงเงิน", "ส่งให้ผู้อนุมัติ"]
      }
    ]
  },
  ...previewAdminSops.slice(1),
  {
    id: "preview-sop-8",
    title: "เอกสารขาย เงินสด และปิดยอดบัญชี",
    status: "published",
    department_id: "accounting",
    created_by: "preview-user",
    purpose: "ทำให้ยอดขาย เงินสด โอน บัตร และเอกสารตรวจสอบย้อนหลังได้",
    when_to_use: "หลังปิดร้านหรือเมื่อส่งยอดให้บัญชี",
    responsible_role: "บัญชี / แคชเชียร์ที่ได้รับมอบหมาย",
    required_tools: "รายงาน POS\nสลิปโอน\nยอดบัตร\nเงินสด\nแฟ้มเอกสารขาย",
    precautions: "ยอดไม่ตรงต้องหยุดและหาสาเหตุก่อนรับรองยอด ห้ามปรับยอดให้ตรงเอง",
    faq: "ถ้าหาสาเหตุไม่เจอ ให้แนบรายการที่สงสัยและส่งให้ผู้จัดการตรวจ",
    tags: ["บัญชี", "ปิดยอด", "เงินสด"],
    updated_at: "2026-07-04T09:40:00Z",
    created_at: "2026-07-04T09:40:00Z",
    departments: [{ display_name: "บัญชี" }],
    sop_steps: [
      {
        id: "cash-1",
        step_order: 1,
        title: "รวบรวมยอดขาย",
        body: "ดึงยอดทุกช่องทางก่อนตรวจเงิน",
        duration_minutes: 10,
        checklist_items: ["ยอด POS", "ยอดเงินสด", "ยอดโอน/QR", "ยอดบัตร"]
      },
      {
        id: "cash-2",
        step_order: 2,
        title: "ตรวจเอกสารและหลักฐาน",
        body: "ทำให้ทุกยอดมีเอกสารรองรับ",
        duration_minutes: 15,
        checklist_items: ["แนบสลิปหรือ batch บัตร", "ตรวจใบเสร็จ/บิลยกเลิก", "แยกคืนสินค้า/ส่วนลด", "จัดเก็บไฟล์ตามวันที่"]
      },
      {
        id: "cash-3",
        step_order: 3,
        title: "ส่งยอดบัญชี",
        body: "ส่งยอดที่ตรวจแล้วพร้อมหมายเหตุ",
        duration_minutes: 10,
        checklist_items: ["สรุปยอดรวม", "ระบุยอดต่างถ้ามี", "ส่งให้ผู้ตรวจ", "เก็บเงินตามขั้นตอน"]
      }
    ]
  },
  {
    id: "preview-sop-9",
    title: "ค่าใช้จ่าย ใบเสนอราคา และคำขอซื้อ",
    status: "published",
    department_id: "accounting",
    created_by: "preview-user",
    purpose: "ควบคุมค่าใช้จ่ายและการสั่งซื้อให้มีหลักฐาน อนุมัติถูกคน และตรวจย้อนหลังได้",
    when_to_use: "ก่อนซื้อของเข้าร้าน จ่ายค่าใช้จ่าย หรือรับใบเสนอราคา",
    responsible_role: "บัญชี / ผู้ขอซื้อ / ผู้อนุมัติ",
    required_tools: "ใบเสนอราคา\nแบบฟอร์มขอซื้อ\nหลักฐานการจ่าย\nรายชื่อผู้อนุมัติ",
    precautions: "ห้ามซื้อก่อนอนุมัติ ยกเว้นเหตุฉุกเฉินที่ได้รับอนุญาตชัดเจน",
    faq: "ค่าใช้จ่ายไม่มีหลักฐานต้องระบุเหตุผลและให้ผู้อนุมัติรับรองเป็นลายลักษณ์อักษร",
    tags: ["บัญชี", "ค่าใช้จ่าย", "purchase request"],
    updated_at: "2026-07-04T09:50:00Z",
    created_at: "2026-07-04T09:50:00Z",
    departments: [{ display_name: "บัญชี" }],
    sop_steps: [
      {
        id: "expense-1",
        step_order: 1,
        title: "รับคำขอ",
        body: "ตรวจว่าคำขอซื้อมีเหตุผลและข้อมูลพออนุมัติ",
        duration_minutes: 10,
        checklist_items: ["ระบุผู้ขอ", "ระบุวัตถุประสงค์", "แนบราคา", "ระบุวันที่ต้องใช้"]
      },
      {
        id: "expense-2",
        step_order: 2,
        title: "ตรวจงบและอนุมัติ",
        body: "ตรวจความเหมาะสมก่อนจ่ายเงินหรือสั่งซื้อ",
        duration_minutes: 15,
        checklist_items: ["เทียบงบประมาณ", "ตรวจผู้ขาย", "ขออนุมัติผู้มีสิทธิ์", "บันทึกสถานะอนุมัติ"]
      },
      {
        id: "expense-3",
        step_order: 3,
        title: "จ่ายและเก็บหลักฐาน",
        body: "ทำให้ค่าใช้จ่ายทุกใบตรวจย้อนหลังได้",
        duration_minutes: 10,
        checklist_items: ["บันทึกวิธีจ่าย", "เก็บใบเสร็จ/ใบกำกับ", "อัปโหลดไฟล์", "สรุปเข้ารายงานบัญชี"]
      }
    ]
  }
];

export const previewTaskAssignments: PreviewTaskAssignment[] = [
  {
    id: "assignment-open",
    sop_id: "preview-sop-1",
    assigned_to: "preview-user",
    assigned_by: "preview-admin",
    work_date: "2026-07-04",
    required: true,
    sops: [previewSops[0]],
    profiles: [{ name: "Preview Leader", email: "preview@company.com" }],
    assigned_profile: [{ name: "Preview Leader", email: "preview@company.com" }]
  },
  {
    id: "assignment-close",
    sop_id: "preview-sop-10",
    assigned_to: "preview-user",
    assigned_by: "preview-admin",
    work_date: "2026-07-04",
    required: true,
    sops: [previewSops.find((sop) => sop.id === "preview-sop-10")!],
    profiles: [{ name: "Preview Leader", email: "preview@company.com" }],
    assigned_profile: [{ name: "Preview Leader", email: "preview@company.com" }]
  },
  {
    id: "assignment-daily-front",
    sop_id: "preview-sop-11",
    assigned_to: "preview-user",
    assigned_by: "preview-admin",
    work_date: "2026-07-04",
    required: true,
    sops: [previewSops.find((sop) => sop.id === "preview-sop-11")!],
    profiles: [{ name: "Preview Leader", email: "preview@company.com" }],
    assigned_profile: [{ name: "Preview Leader", email: "preview@company.com" }]
  },
  {
    id: "assignment-stock",
    sop_id: "preview-sop-2",
    assigned_to: "preview-user",
    assigned_by: "preview-admin",
    work_date: "2026-07-04",
    required: true,
    sops: [previewSops.find((sop) => sop.id === "preview-sop-2")!],
    profiles: [{ name: "Preview Leader", email: "preview@company.com" }],
    assigned_profile: [{ name: "Preview Leader", email: "preview@company.com" }]
  }
];

export const previewTaskRuns: PreviewTaskRun[] = [
  {
    id: "run-open",
    assignment_id: "assignment-open",
    user_id: "preview-user",
    status: "completed",
    started_at: "2026-07-04T02:00:00Z",
    completed_at: "2026-07-04T02:12:00Z",
    due_seconds: 900,
    completed_checklist: 6,
    total_checklist: 6
  }
];

export const previewLoginEvents: PreviewLoginEvent[] = [
  {
    id: "login-preview-user",
    user_id: "preview-user",
    work_date: "2026-07-04",
    first_seen_at: "2026-07-04T01:55:00Z",
    last_seen_at: "2026-07-04T03:30:00Z"
  }
];

export function isPreviewMode() {
  const siteAccess = process.env.NEXT_PUBLIC_SITE_ACCESS ?? "public";
  return siteAccess !== "private" || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
