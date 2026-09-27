import { z } from "zod";

// เอกสารพนักงาน (ประกันสังคม + เงินเดือน) — logic ล้วน ไม่มี I/O จึงเทสต์ได้.
//
// ฟิลด์ตามแบบฟอร์มของสำนักงานบัญชี (UP_LEVEL_Employee_Master.xlsx แท็บ "ข้อมูลพนักงาน")
// ลำดับคอลัมน์ในชีตที่ Apps Script เขียนลง Drive = ลำดับเดียวกับแบบฟอร์มนั้นเป๊ะ (A–AN)
// แล้วต่อท้ายด้วยคอลัมน์ที่แบบฟอร์มไม่มีแต่ สปส.1-03 ต้องใช้ (ที่อยู่) + ข้อมูลระบบ.
//
// ไม่ผูก KPI / เงินเดือนใดๆ ทั้งสิ้น — เป็นแค่ฟอร์มเก็บเอกสาร.

export const STAFF_DOCS_COLLECTION = "sop_staff_documents";
export const STAFF_DOCS_HISTORY = "history";
/** Storage prefix — ไฟล์อยู่ที่นี่แค่ชั่วคราวจนกว่าจะขึ้น Drive สำเร็จ แล้วถูกลบทิ้ง */
export const STAFF_DOCS_STORAGE_PREFIX = "sop-staff-documents";

export const STAFF_DOCS_DEADLINE = "2026-09-30";
export const STAFF_DOCS_DEADLINE_LABEL = "30 ก.ย. 2569";
/** โฟลเดอร์ "เอกสาร Up Level Enterprise" ใน Drive ของแชมป์ */
export const STAFF_DOCS_DRIVE_ROOT = "https://drive.google.com/drive/folders/1O94mfqq408V-LIrQmE3LAxOf0UKVvtgL";

/** ชื่อเล่นภาษาไทยที่ใช้ตั้งชื่อโฟลเดอร์/ไฟล์ใน Drive — ไม่มีในแมพ = ใช้ displayName */
export const THAI_NICKNAMES: Record<string, string> = {
  "UP-003": "บูม",
  "UP-005": "ลีโอ",
  "UP-006": "พี",
  "UP-007": "นน",
  "UP-008": "ก้อง"
};

/** รหัสพนักงานทดสอบ — ใช้เลขบัตร 0000000000000 ได้ และแจ้งเตือนติดป้าย TEST */
export function isTestEmployee(employeeId: string): boolean {
  return /^TEST-/i.test(employeeId);
}

// ---------------------------------------------------------------- ตัวเลือก (ตรงกับ dropdown ในแบบฟอร์มบัญชี)

export const TITLE_OPTIONS = ["นาย", "นาง", "นางสาว", "อื่น ๆ"] as const;
export const PERSON_TYPE_OPTIONS = ["คนไทย", "คนต่างด้าว"] as const;
export const MARITAL_OPTIONS = ["โสด", "สมรส", "หม้าย", "หย่า", "แยกกันอยู่"] as const;
export const BODY_OPTIONS = ["ปกติ", "พิการ"] as const;
export const EMPLOYMENT_OPTIONS = ["รายเดือน", "รายวัน", "อื่น ๆ"] as const;
export const PRIOR_INSURED_OPTIONS = ["ไม่เคย", "เคย"] as const;
export const MULTI_EMPLOYER_OPTIONS = ["ไม่", "ใช่"] as const;
export const HOSPITAL_CHOICE_OPTIONS = [
  "ไม่เปลี่ยนแปลง",
  "เลือกสถานพยาบาลใหม่",
  "ขอเปลี่ยนสถานพยาบาล",
  "ยังไม่มีบัตรรับรองสิทธิฯ",
  "รอตรวจสอบ"
] as const;
export const BANK_OPTIONS = [
  "กรุงเทพ",
  "กสิกรไทย",
  "กรุงไทย",
  "กรุงศรีอยุธยา",
  "ไทยพาณิชย์",
  "ทหารไทยธนชาต (ttb)",
  "ออมสิน",
  "ธ.ก.ส.",
  "ยูโอบี",
  "ซีไอเอ็มบี ไทย",
  "อื่น ๆ"
] as const;

// ---------------------------------------------------------------- ฟอร์ม

export type StaffDocForm = {
  title: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  personType: string;
  nationalId: string;
  nationality: string;
  birthDate: string;
  maritalStatus: string;
  childrenUnder6: string;
  childBirthYear1: string;
  childBirthYear2: string;
  childBirthYear3: string;
  bodyStatus: string;
  disability: string;
  phone: string;
  email: string;
  address: string;
  startDate: string;
  employmentKind: string;
  priorInsured: string;
  multiEmployer: string;
  otherEmployer: string;
  currentHospital: string;
  hospitalChoice: string;
  hospital1: string;
  hospital2: string;
  hospital3: string;
  bank: string;
  bankOther: string;
  bankAccount: string;
  bankAccountName: string;
  bankBranch: string;
  note: string;
};

export const FORM_KEYS = [
  "title",
  "firstNameTh",
  "lastNameTh",
  "firstNameEn",
  "lastNameEn",
  "personType",
  "nationalId",
  "nationality",
  "birthDate",
  "maritalStatus",
  "childrenUnder6",
  "childBirthYear1",
  "childBirthYear2",
  "childBirthYear3",
  "bodyStatus",
  "disability",
  "phone",
  "email",
  "address",
  "startDate",
  "employmentKind",
  "priorInsured",
  "multiEmployer",
  "otherEmployer",
  "currentHospital",
  "hospitalChoice",
  "hospital1",
  "hospital2",
  "hospital3",
  "bank",
  "bankOther",
  "bankAccount",
  "bankAccountName",
  "bankBranch",
  "note"
] as const satisfies ReadonlyArray<keyof StaffDocForm>;

export type FormKey = (typeof FORM_KEYS)[number];

export const FIELD_LABELS: Record<FormKey, string> = {
  title: "คำนำหน้า",
  firstNameTh: "ชื่อ (ไทย)",
  lastNameTh: "นามสกุล (ไทย)",
  firstNameEn: "ชื่อ (อังกฤษ)",
  lastNameEn: "นามสกุล (อังกฤษ)",
  personType: "ประเภทบุคคล",
  nationalId: "เลขบัตรประชาชน",
  nationality: "สัญชาติ",
  birthDate: "วันเดือนปีเกิด",
  maritalStatus: "สถานภาพครอบครัว",
  childrenUnder6: "จำนวนบุตรอายุไม่เกิน 6 ปี",
  childBirthYear1: "ปีเกิดบุตรคนที่ 1",
  childBirthYear2: "ปีเกิดบุตรคนที่ 2",
  childBirthYear3: "ปีเกิดบุตรคนที่ 3",
  bodyStatus: "สภาพร่างกาย",
  disability: "ประเภทความพิการ",
  phone: "เบอร์โทรศัพท์",
  email: "อีเมล",
  address: "ที่อยู่ตามบัตรประชาชน",
  startDate: "วันที่เริ่มงาน",
  employmentKind: "ประเภทการจ้าง",
  priorInsured: "เคยเป็นผู้ประกันตน",
  multiEmployer: "ทำงานกับนายจ้างหลายแห่ง",
  otherEmployer: "ชื่อนายจ้างอื่น",
  currentHospital: "สถานพยาบาลปัจจุบัน",
  hospitalChoice: "การเลือก / เปลี่ยนสถานพยาบาล",
  hospital1: "สถานพยาบาลลำดับ 1",
  hospital2: "สถานพยาบาลลำดับ 2",
  hospital3: "สถานพยาบาลลำดับ 3",
  bank: "ธนาคาร",
  bankOther: "ชื่อธนาคาร",
  bankAccount: "เลขที่บัญชีธนาคาร",
  bankAccountName: "ชื่อบัญชีธนาคาร",
  bankBranch: "สาขาธนาคาร",
  note: "หมายเหตุ"
};

export function emptyForm(): StaffDocForm {
  return Object.fromEntries(FORM_KEYS.map((key) => [key, ""])) as StaffDocForm;
}

/** เติมค่าเริ่มต้นจากสิ่งที่ SOP รู้อยู่แล้ว — พนักงานแค่ยืนยัน */
export function prefillForm(input: { email?: string; employmentType?: string }): StaffDocForm {
  return {
    ...emptyForm(),
    personType: "คนไทย",
    nationality: "ไทย",
    bodyStatus: "ปกติ",
    childrenUnder6: "0",
    email: input.email || "",
    employmentKind: input.employmentType === "full_time" ? "รายเดือน" : input.employmentType === "part_time" ? "รายวัน" : ""
  };
}

/** รวม draft ที่เก็บไว้ในเครื่องเข้ากับค่าเริ่มต้น — เก็บเฉพาะคีย์ที่รู้จัก ค่าเป็น string เท่านั้น */
export function mergeDraft(base: StaffDocForm, draft: unknown): StaffDocForm {
  const next = { ...base };
  if (!draft || typeof draft !== "object") return next;
  for (const key of FORM_KEYS) {
    const value = (draft as Record<string, unknown>)[key];
    if (typeof value === "string") next[key] = value;
  }
  return next;
}

// ---------------------------------------------------------------- ตรวจความถูกต้อง

const digits = (value: string) => value.replace(/\D/g, "");

/** เลขบัตรประชาชนไทย 13 หลัก + check digit (mod 11) */
export function isValidThaiId(value: string): boolean {
  const id = digits(value);
  if (id.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() || (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

/** ปีเกิดบุตร รับได้ทั้ง ค.ศ. และ พ.ศ. (พ.ศ. = ค.ศ. + 543) */
function isChildBirthYear(value: string, todayIso: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value) > 2400 ? Number(value) - 543 : Number(value);
  const thisYear = Number(todayIso.slice(0, 4));
  return year >= thisYear - 7 && year <= thisYear;
}

export function childCount(form: Pick<StaffDocForm, "childrenUnder6">): number {
  const count = Number(digits(form.childrenUnder6 || "0") || "0");
  return Math.max(0, Math.min(3, count));
}

export function needsHospitalRanking(form: Pick<StaffDocForm, "hospitalChoice">): boolean {
  return form.hospitalChoice === "เลือกสถานพยาบาลใหม่" || form.hospitalChoice === "ขอเปลี่ยนสถานพยาบาล";
}

export type FileKind = "idCard" | "bankBook" | "other";

export const FILE_LABELS: Record<FileKind, string> = {
  idCard: "สำเนาบัตรประชาชน (ด้านหน้า)",
  bankBook: "หน้าสมุดบัญชีธนาคาร",
  other: "เอกสารอื่น"
};

/** ชื่อที่ใช้ตั้งไฟล์ใน Drive: <รหัส>_<ชื่อเล่น>_<ชื่อนี้>.<ext> */
export const FILE_DRIVE_NAMES: Record<FileKind, string> = {
  idCard: "บัตรประชาชน",
  bankBook: "สมุดบัญชี",
  other: "เอกสารอื่น"
};

export const REQUIRED_FILES: FileKind[] = ["idCard", "bankBook"];

export type ValidationIssue = { key: FormKey | FileKind; label: string; message: string };

export type ValidateOptions = {
  /** วันนี้ (YYYY-MM-DD, เวลาไทย) — ใช้เช็คอายุ/วันเริ่มงาน */
  today: string;
  /** ไฟล์ที่มีแล้ว (อัปโหลดใหม่ หรือมีอยู่ใน Drive จากการส่งครั้งก่อน) */
  files: Partial<Record<FileKind, boolean>>;
  employeeId?: string;
};

/**
 * ทุกปัญหาของฟอร์ม เรียงตามลำดับที่อยู่บนหน้า. ใช้ทั้งฝั่งหน้าเว็บ (ปิดปุ่มส่ง + บอกว่าขาดอะไร)
 * และฝั่ง server (ปฏิเสธถ้ายังมีปัญหา) — กฎชุดเดียวกัน ไม่มีทางหลุดคนละแบบ.
 */
export function validateStaffDocForm(form: StaffDocForm, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (key: FormKey | FileKind, message: string) =>
    issues.push({ key, label: key in FIELD_LABELS ? FIELD_LABELS[key as FormKey] : FILE_LABELS[key as FileKind], message });
  const required = (key: FormKey) => {
    if (!String(form[key] || "").trim()) {
      add(key, "ยังไม่ได้กรอก");
      return false;
    }
    return true;
  };
  const oneOf = (key: FormKey, options: readonly string[]) => {
    if (required(key) && !options.includes(form[key])) add(key, "เลือกจากตัวเลือกเท่านั้น");
  };

  oneOf("title", TITLE_OPTIONS);
  if (required("firstNameTh") && /[A-Za-z]/.test(form.firstNameTh)) add("firstNameTh", "กรอกเป็นภาษาไทย");
  if (required("lastNameTh") && /[A-Za-z]/.test(form.lastNameTh)) add("lastNameTh", "กรอกเป็นภาษาไทย");
  if (required("firstNameEn") && !/^[A-Za-z][A-Za-z .'-]*$/.test(form.firstNameEn.trim())) add("firstNameEn", "กรอกเป็นภาษาอังกฤษ");
  if (required("lastNameEn") && !/^[A-Za-z][A-Za-z .'-]*$/.test(form.lastNameEn.trim())) add("lastNameEn", "กรอกเป็นภาษาอังกฤษ");
  oneOf("personType", PERSON_TYPE_OPTIONS);

  if (required("nationalId")) {
    const id = digits(form.nationalId);
    const testBypass = options.employeeId && isTestEmployee(options.employeeId) && id === "0000000000000";
    if (id.length !== 13) add("nationalId", "ต้องมี 13 หลัก");
    else if (!testBypass && !isValidThaiId(id)) add("nationalId", "เลขไม่ถูกต้อง ตรวจกับบัตรอีกครั้ง");
  }
  required("nationality");

  if (required("birthDate")) {
    if (!isIsoDate(form.birthDate)) add("birthDate", "วันที่ไม่ถูกต้อง");
    else {
      const age = yearsBetween(form.birthDate, options.today);
      if (age < 15 || age > 80) add("birthDate", "ตรวจปีเกิดอีกครั้ง (ใช้ปี ค.ศ. ในปฏิทิน)");
    }
  }

  oneOf("maritalStatus", MARITAL_OPTIONS);
  if (required("childrenUnder6")) {
    if (!/^\d{1,2}$/.test(form.childrenUnder6.trim())) add("childrenUnder6", "กรอกเป็นตัวเลข");
    else {
      const count = childCount(form);
      const keys: FormKey[] = ["childBirthYear1", "childBirthYear2", "childBirthYear3"];
      keys.slice(0, count).forEach((key) => {
        if (required(key) && !isChildBirthYear(form[key].trim(), options.today)) add(key, "ปีเกิดไม่ถูกต้อง (เช่น 2566)");
      });
    }
  }

  oneOf("bodyStatus", BODY_OPTIONS);
  if (form.bodyStatus === "พิการ") required("disability");

  if (required("phone") && !/^0\d{8,9}$/.test(digits(form.phone))) add("phone", "เบอร์ 9–10 หลัก ขึ้นต้นด้วย 0");
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) add("email", "อีเมลไม่ถูกต้อง");
  if (required("address") && form.address.trim().length < 15) add("address", "กรอกที่อยู่ให้ครบ (บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด)");

  if (required("startDate")) {
    if (!isIsoDate(form.startDate)) add("startDate", "วันที่ไม่ถูกต้อง");
    else if (form.startDate < "2020-01-01" || form.startDate > addDaysIso(options.today, 60)) add("startDate", "ตรวจวันที่เริ่มงานอีกครั้ง");
  }
  oneOf("employmentKind", EMPLOYMENT_OPTIONS);

  oneOf("priorInsured", PRIOR_INSURED_OPTIONS);
  oneOf("multiEmployer", MULTI_EMPLOYER_OPTIONS);
  if (form.multiEmployer === "ใช่") required("otherEmployer");
  oneOf("hospitalChoice", HOSPITAL_CHOICE_OPTIONS);
  if (form.hospitalChoice === "ไม่เปลี่ยนแปลง" || form.hospitalChoice === "ขอเปลี่ยนสถานพยาบาล") required("currentHospital");
  if (needsHospitalRanking(form)) required("hospital1");

  oneOf("bank", BANK_OPTIONS);
  if (form.bank === "อื่น ๆ") required("bankOther");
  if (required("bankAccount") && !/^\d{10,15}$/.test(digits(form.bankAccount))) add("bankAccount", "เลขบัญชี 10–15 หลัก");
  required("bankAccountName");

  for (const kind of REQUIRED_FILES) {
    if (!options.files[kind]) add(kind, "ยังไม่ได้แนบ");
  }

  for (const key of FORM_KEYS) {
    if (String(form[key] || "").length > 300) add(key, "ยาวเกินไป");
  }

  return issues;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** รูปทรงที่ server รับ — ทุกคีย์เป็น string, ตัดคีย์แปลกทิ้ง, จำกัดความยาว */
export const staffDocFormSchema = z.object(
  Object.fromEntries(FORM_KEYS.map((key) => [key, z.string().max(300).default("")])) as Record<
    FormKey,
    z.ZodDefault<z.ZodString>
  >
);

/** ตัดช่องว่างหัวท้าย + ล้างค่าที่ไม่เกี่ยว (เช่นปีเกิดบุตรเกินจำนวนบุตร) ก่อนเก็บ/ส่งเข้าชีต */
export function normalizeForm(form: StaffDocForm): StaffDocForm {
  const next = Object.fromEntries(FORM_KEYS.map((key) => [key, String(form[key] ?? "").trim()])) as StaffDocForm;
  next.nationalId = digits(next.nationalId);
  next.phone = digits(next.phone);
  next.bankAccount = digits(next.bankAccount);
  next.childrenUnder6 = String(Number(digits(next.childrenUnder6) || "0"));
  const count = childCount(next);
  (["childBirthYear1", "childBirthYear2", "childBirthYear3"] as const).forEach((key, index) => {
    if (index >= count) next[key] = "";
  });
  if (next.bodyStatus !== "พิการ") next.disability = "";
  if (next.multiEmployer !== "ใช่") next.otherEmployer = "";
  if (next.bank !== "อื่น ๆ") next.bankOther = "";
  if (!needsHospitalRanking(next)) {
    next.hospital1 = "";
    next.hospital2 = "";
    next.hospital3 = "";
  }
  return next;
}

// ---------------------------------------------------------------- ใครต้องกรอก + สถานะ

export type StaffLike = { role: string; active: boolean; employeeId?: string; code?: string };

/** ต้องกรอก = พนักงาน (ไม่ใช่เจ้าของ/แอดมิน) ที่ยังทำงานอยู่ */
export function isDocsEligible(staff: StaffLike | null | undefined): boolean {
  return Boolean(staff && staff.active && staff.role === "employee" && (staff.employeeId || staff.code));
}

export type DriveStatus = "pending_drive" | "on_drive" | "drive_failed";
export type DocsStatus = "not_submitted" | DriveStatus;

export type StaffDocFileRef = {
  kind: FileKind;
  /** ชื่อไฟล์เดิมจากเครื่องพนักงาน (แสดงผลเท่านั้น) */
  originalName: string;
  mimeType: string;
  size: number;
  /** path ใน Storage — ว่างเมื่อขึ้น Drive แล้วและลบจาก Storage แล้ว */
  storagePath?: string;
};

/** เอกสาร Firestore ต่อพนักงาน 1 คน (id = employeeId). ข้อมูลส่วนตัวอยู่ใน `pending` เท่านั้น */
export type StaffDocRecord = {
  employeeId: string;
  code: string;
  nickname: string;
  email: string;
  status: DriveStatus;
  submittedAt: string;
  submitCount: number;
  lastSubmissionId: string;
  driveAttempts: number;
  driveError?: string;
  driveSyncedAt?: string;
  driveFolderUrl?: string;
  sheetUrl?: string;
  /** ประเภทไฟล์ที่เคยขึ้น Drive แล้ว — ส่งครั้งถัดไปไม่ต้องแนบซ้ำ */
  filesOnDrive?: FileKind[];
  /** มีเฉพาะระหว่างรอขึ้น Drive — ลบทิ้งทันทีที่ขึ้นสำเร็จ */
  pending?: { submissionId: string; form: StaffDocForm; files: StaffDocFileRef[] };
};

export function docsStatus(record: Pick<StaffDocRecord, "status"> | null | undefined): DocsStatus {
  return record?.status ?? "not_submitted";
}

export const DOCS_STATUS_LABEL: Record<DocsStatus, string> = {
  not_submitted: "ยังไม่ส่ง",
  pending_drive: "ส่งแล้ว · กำลังขึ้นไดรฟ์",
  on_drive: "ส่งแล้ว · ขึ้นไดรฟ์แล้ว",
  drive_failed: "ส่งแล้ว · ขึ้นไดรฟ์ไม่สำเร็จ"
};

/** สถานะที่พนักงานเห็น — เรื่องไดรฟ์เป็นงานของแอดมิน พนักงานไม่ต้องกังวล */
export const STAFF_STATUS_LABEL: Record<DocsStatus, string> = {
  not_submitted: "ยังไม่ส่ง",
  pending_drive: "ส่งแล้ว · กำลังส่งต่อให้เจ้าของร้าน",
  on_drive: "ส่งแล้ว · เจ้าของร้านได้รับเอกสารแล้ว",
  drive_failed: "ส่งแล้ว · ระบบกำลังส่งต่อให้เจ้าของร้าน"
};

/** สาเหตุที่ขึ้นไดรฟ์ไม่สำเร็จ แปลเป็นภาษาคนสำหรับหน้าแอดมิน */
export function driveErrorText(error: string | undefined): string {
  if (!error) return "";
  if (error === "drive_bridge_not_configured") return "ยังไม่ได้ตั้งค่า STAFF_DOCS_GAS_URL / STAFF_DOCS_GAS_SECRET";
  if (/^bad_response_(401|403)$/.test(error)) return "สคริปต์ไดรฟ์ยังไม่ได้รับอนุญาต — เปิดสคริปต์แล้วกด Run ฟังก์ชัน authorize ครั้งเดียว";
  if (error === "unauthorized") return "รหัสลับไม่ตรงกับสคริปต์ไดรฟ์";
  if (error === "timeout") return "ไดรฟ์ตอบช้าเกินไป ลองใหม่";
  if (error.startsWith("storage:")) return "หาไฟล์ในระบบไม่เจอ — ให้พนักงานแนบใหม่";
  return error;
}

/** แถบ "ทำด่วน" ขึ้นจนกว่าจะส่ง (ส่งแล้วแต่ไดรฟ์พัง = งานของแอดมิน ไม่ใช่ของพนักงาน) */
export function shouldShowDocsBanner(staff: StaffLike | null | undefined, record: Pick<StaffDocRecord, "status"> | null | undefined): boolean {
  return isDocsEligible(staff) && docsStatus(record) === "not_submitted";
}

export function daysUntilDeadline(today: string, deadline = STAFF_DOCS_DEADLINE): number {
  const ms = new Date(`${deadline}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function deadlineText(today: string): string {
  const days = daysUntilDeadline(today);
  if (days < 0) return `เลยกำหนด ${STAFF_DOCS_DEADLINE_LABEL} มาแล้ว ${-days} วัน`;
  if (days === 0) return `ส่งภายในวันนี้ (${STAFF_DOCS_DEADLINE_LABEL})`;
  return `ส่งภายใน ${STAFF_DOCS_DEADLINE_LABEL} · เหลือ ${days} วัน`;
}

/** ลอง push ขึ้นไดรฟ์ใหม่ได้ไหม: มีข้อมูลค้างอยู่ และไม่ได้สำเร็จไปแล้ว */
export function canRetryDrive(record: StaffDocRecord | null | undefined): boolean {
  return Boolean(record && record.status !== "on_drive" && record.pending);
}

export function filesSatisfied(uploaded: Partial<Record<FileKind, boolean>>, onDrive: FileKind[] = []): Partial<Record<FileKind, boolean>> {
  const result: Partial<Record<FileKind, boolean>> = {};
  for (const kind of ["idCard", "bankBook", "other"] as FileKind[]) {
    result[kind] = Boolean(uploaded[kind] || onDrive.includes(kind));
  }
  return result;
}

// ---------------------------------------------------------------- ไฟล์

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // ต่ำกว่าเพดาน body ของ Vercel (~4.5MB)
export const MAX_OTHER_FILES = 3;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf"
};

/** ชนิดไฟล์ที่รับ — บางเบราว์เซอร์ส่ง type ว่างมากับ HEIC จึงดูจากนามสกุลด้วย */
export function resolveMimeType(name: string, type: string): string | null {
  const clean = (type || "").toLowerCase();
  if (EXT_BY_MIME[clean]) return clean;
  const ext = name.toLowerCase().split(".").pop() || "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf"
  };
  if ((!clean || clean === "application/octet-stream") && byExt[ext]) return byExt[ext];
  return null;
}

export function extensionFor(mimeType: string): string {
  return EXT_BY_MIME[mimeType] || "bin";
}

/** <รหัส>_<ชื่อเล่น>_<ประเภท>[-n].<ext> — ตัดอักขระที่ Drive/ระบบไฟล์ไม่ชอบ */
export function driveFileName(employeeId: string, nickname: string, kind: FileKind, mimeType: string, index = 0): string {
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, "").trim();
  const suffix = kind === "other" ? `-${index + 1}` : "";
  return `${safe(employeeId)}_${safe(nickname)}_${FILE_DRIVE_NAMES[kind]}${suffix}.${extensionFor(mimeType)}`;
}

export function staffFolderName(employeeId: string, nickname: string): string {
  return `${employeeId} ${nickname}`.replace(/[\\/:*?"<>|]/g, "").trim();
}

// ---------------------------------------------------------------- แถวในชีต (ลำดับคอลัมน์ = แบบฟอร์มบัญชี)

export const SHEET_HEADERS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "คำนำหน้า",
  "ชื่อ (ไทย)",
  "นามสกุล (ไทย)",
  "ชื่อ (อังกฤษ)",
  "นามสกุล (อังกฤษ)",
  "ประเภทบุคคล",
  "เลขบัตรประชาชน",
  "สัญชาติ",
  "วันเดือนปีเกิด",
  "สถานภาพครอบครัว",
  "จำนวนบุตรอายุไม่เกิน 6 ปี",
  "ปีเกิดบุตรคนที่ 1",
  "ปีเกิดบุตรคนที่ 2",
  "ปีเกิดบุตรคนที่ 3",
  "สภาพร่างกาย",
  "ประเภทความพิการ (ถ้ามี)",
  "เบอร์โทรศัพท์",
  "อีเมล",
  "วันที่เริ่มงาน",
  "ประเภทการจ้าง",
  "ตำแหน่ง",
  "แผนก",
  "สาขา / สถานที่ทำงาน",
  "เงินเดือน / ค่าจ้างต่อเดือน",
  "ขึ้นทะเบียนประกันสังคม",
  "เคยเป็นผู้ประกันตน",
  "ทำงานกับนายจ้างหลายแห่ง",
  "ชื่อนายจ้างอื่น (ถ้ามี)",
  "สถานพยาบาลปัจจุบัน",
  "การเลือก / เปลี่ยนสถานพยาบาล",
  "สถานพยาบาลลำดับ 1",
  "สถานพยาบาลลำดับ 2",
  "สถานพยาบาลลำดับ 3",
  "ธนาคาร",
  "เลขที่บัญชีธนาคาร",
  "ชื่อบัญชีธนาคาร",
  "สาขาธนาคาร (ถ้ามี)",
  "หมายเหตุ Payroll / HR",
  // ต่อท้าย — ไม่มีในแบบฟอร์มบัญชี
  "ที่อยู่ตามบัตรประชาชน",
  "ชื่อเล่น",
  "ส่งล่าสุด",
  "ส่งครั้งที่",
  "โฟลเดอร์เอกสาร"
] as const;

/** คอลัมน์ (index 0-based) ที่เป็นวันที่ — Apps Script แปลง YYYY-MM-DD เป็น Date */
export const SHEET_DATE_COLUMNS = [10, 20];
/** คอลัมน์ที่ต้องเก็บเป็นข้อความ (เลขนำหน้าด้วย 0) */
export const SHEET_TEXT_COLUMNS = [1, 8, 18, 36];

/**
 * แถวของพนักงาน 1 คน. `null` = "อย่าแตะช่องนี้" — เป็นช่องที่เจ้าของ/สำนักงานบัญชีกรอกเอง
 * (ตำแหน่ง แผนก เงินเดือน สถานะขึ้นทะเบียน) พนักงานส่งซ้ำกี่รอบก็ไม่ทับ.
 * ลำดับ (A) กับลิงก์โฟลเดอร์ (ท้ายสุด) ให้ Apps Script เติมเอง.
 */
export function sheetRowFor(
  form: StaffDocForm,
  meta: { employeeId: string; nickname: string; branchLabel: string; submittedAtLabel: string; submitCount: number }
): Array<string | null> {
  const f = normalizeForm(form);
  const dash = (value: string) => value || "-";
  const count = childCount(f);
  const row: Array<string | null> = [
    null,
    meta.employeeId,
    f.title,
    f.firstNameTh,
    f.lastNameTh,
    f.firstNameEn,
    f.lastNameEn,
    f.personType,
    f.nationalId,
    f.nationality,
    f.birthDate,
    f.maritalStatus,
    String(count),
    dash(f.childBirthYear1),
    dash(f.childBirthYear2),
    dash(f.childBirthYear3),
    f.bodyStatus,
    dash(f.disability),
    f.phone,
    f.email,
    f.startDate,
    f.employmentKind,
    null,
    null,
    meta.branchLabel,
    null,
    null,
    f.priorInsured,
    f.multiEmployer,
    f.otherEmployer,
    f.currentHospital,
    f.hospitalChoice,
    f.hospital1,
    f.hospital2,
    f.hospital3,
    f.bank === "อื่น ๆ" ? f.bankOther : f.bank,
    f.bankAccount,
    f.bankAccountName,
    f.bankBranch,
    f.note,
    f.address,
    meta.nickname,
    meta.submittedAtLabel,
    String(meta.submitCount),
    null
  ];
  return row;
}

/** อ่านแถวจากชีตกลับเป็นฟอร์ม (ใช้ตอนพนักงานกด "แก้ไข" หลังข้อมูลขึ้นไดรฟ์แล้ว) */
export function formFromSheetRow(row: unknown[]): StaffDocForm {
  const cell = (index: number) => {
    const value = row[index];
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    return text === "-" ? "" : text;
  };
  const bank = cell(35);
  const knownBank = (BANK_OPTIONS as readonly string[]).includes(bank);
  return {
    ...emptyForm(),
    title: cell(2),
    firstNameTh: cell(3),
    lastNameTh: cell(4),
    firstNameEn: cell(5),
    lastNameEn: cell(6),
    personType: cell(7),
    nationalId: cell(8),
    nationality: cell(9),
    birthDate: cell(10).slice(0, 10),
    maritalStatus: cell(11),
    childrenUnder6: cell(12) || "0",
    childBirthYear1: cell(13),
    childBirthYear2: cell(14),
    childBirthYear3: cell(15),
    bodyStatus: cell(16),
    disability: cell(17),
    phone: cell(18),
    email: cell(19),
    startDate: cell(20).slice(0, 10),
    employmentKind: cell(21),
    priorInsured: cell(27),
    multiEmployer: cell(28),
    otherEmployer: cell(29),
    currentHospital: cell(30),
    hospitalChoice: cell(31),
    hospital1: cell(32),
    hospital2: cell(33),
    hospital3: cell(34),
    bank: bank ? (knownBank ? bank : "อื่น ๆ") : "",
    bankOther: bank && !knownBank ? bank : "",
    bankAccount: cell(36),
    bankAccountName: cell(37),
    bankBranch: cell(38),
    note: cell(39),
    address: cell(40)
  };
}

/** ข้อความแจ้งแชมป์ทาง Telegram — plain text, ไม่มีข้อมูลส่วนตัว */
export function notifyMessage(input: { nickname: string; employeeId: string; submitCount: number; test: boolean }): string {
  const again = input.submitCount > 1 ? ` (แก้ไขครั้งที่ ${input.submitCount})` : "";
  return `${input.test ? "TEST - " : ""}เอกสารพนักงาน: ${input.nickname} (${input.employeeId}) ส่งเอกสารแล้ว${again}`;
}
