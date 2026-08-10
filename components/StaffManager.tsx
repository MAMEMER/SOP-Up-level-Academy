import type { StaffRecord } from "../lib/staff-records.ts";

type Branch = { key: string; label: string };

type StaffManagerProps = {
  staff: StaffRecord[];
  branches: Branch[];
  currentEmail: string;
  saveAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
};

// ทุกตัวเลือกที่นี่คือ "ระดับสิทธิ์ของพนักงาน" ไม่ใช่ตำแหน่งเจ้าของ.
// เจ้าของร้านมีแค่ 2 คน (แชมป์ + เนม) กำหนดไว้ใน lib/owner.ts เปลี่ยนที่นี่ไม่ได้ —
// เดิมตัวเลือกนี้เขียนว่า "แอดมิน" เฉยๆ เลยอ่านเหมือนเป็นเจ้าของอีกคน
const roleOptions: Array<{ value: StaffRecord["role"]; label: string; hint: string }> = [
  { value: "employee", label: "พนักงาน", hint: "เห็นเฉพาะงานของตัวเอง" },
  { value: "leader", label: "พนักงาน · หัวหน้าแผนก", hint: "เห็นงานในแผนกตัวเอง" },
  { value: "admin", label: "พนักงาน · สิทธิ์จัดการ", hint: "เห็นงานทุกคน มอบหมายและตรวจงานได้ · ไม่เห็นตัวเลขเงินเดือน" }
];

function StaffForm({
  record,
  branches,
  saveAction,
  removeAction,
  isSelf
}: {
  record?: StaffRecord;
  branches: Branch[];
  saveAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  isSelf?: boolean;
}) {
  const isNew = !record;

  return (
    <article className={`staff-card${isNew ? " staff-card--new" : ""}`}>
      <form action={saveAction} className="staff-form">
        <div className="staff-form__head">
          <div>
            <strong>{isNew ? "เพิ่มพนักงานใหม่" : record.name}</strong>
            {!isNew ? <small>{record.employeeId ? `${record.employeeId} · ` : ""}{record.email}</small> : null}
          </div>
          {!isNew && !record.active ? <span className="score-badge score-badge-red">ปิดการใช้งาน</span> : null}
        </div>

        <div className="staff-form__grid">
          <label>
            รหัสพนักงาน (ใช้อ้างอิงในเอกสาร)
            <input name="employeeId" defaultValue={record?.employeeId || ""} placeholder={isNew ? "ระบบตั้งให้อัตโนมัติ" : ""} />
            <small>ออกให้ครั้งเดียวและไม่นำกลับมาใช้ซ้ำ — คนละอย่างกับ “รหัสพนักงาน” ด้านล่างที่เป็นตัวเชื่อมข้อมูลภายใน</small>
          </label>

          <label>
            อีเมล Google
            {isNew ? (
              <input name="email" type="email" placeholder="name@gmail.com" required autoComplete="off" />
            ) : (
              <input name="email" type="email" defaultValue={record.email} readOnly />
            )}
          </label>

          <label>
            ชื่อที่แสดง
            <input name="name" defaultValue={record?.name || ""} placeholder="เช่น บูม" required />
          </label>

          <label>
            สิทธิ์
            <select name="role" defaultValue={record?.role || "employee"}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>
              ))}
            </select>
          </label>

          <label>
            แผนก
            <input name="departmentId" defaultValue={record?.departmentId || "front-store"} placeholder="front-store" />
          </label>

          <label className="staff-form__toggle">
            <input type="checkbox" name="onRoster" defaultChecked={record ? record.onRoster : true} />
            อยู่ในตารางกะ (ขึ้นใน KPI / มอบหมายงาน)
          </label>

          <label className="staff-form__toggle">
            <input type="checkbox" name="active" defaultChecked={record ? record.active : true} />
            เปิดใช้งาน (ปิด = login ไม่ได้ แต่เก็บประวัติไว้)
          </label>

          <label>
            รหัสเชื่อมข้อมูล (ภายในระบบ)
            <input name="code" defaultValue={record?.code || ""} placeholder="เช่น Boom" />
            <small>ใช้เชื่อมตารางกะ / KPI / งานที่บันทึกไว้ — เปลี่ยนแล้วประวัติเดิมจะไม่ตามมา</small>
          </label>

          <label>
            ชื่อในตารางกะ
            <input name="displayName" defaultValue={record?.displayName || ""} placeholder="ชื่อตามชีตตารางกะ" />
          </label>

          <label>
            ประเภทการจ้าง
            <select name="employmentType" defaultValue={record?.employmentType || "part_time"}>
              <option value="part_time">Part time</option>
              <option value="full_time">Full time</option>
            </select>
            <small>มีผลกับวิธีคิดหักเงินเมื่อคะแนนต่ำกว่า 50</small>
          </label>

          <label>
            สาขา
            <select name="branch" defaultValue={record?.branch || branches[0]?.key}>
              {branches.map((branch) => (
                <option key={branch.key} value={branch.key}>{branch.label}</option>
              ))}
            </select>
          </label>

          <label className="wide">
            ชื่อใน StoreHub (คั่นด้วยจุลภาค)
            <input name="aliases" defaultValue={(record?.aliases || []).join(", ")} placeholder="เช่น boom, boom dog" />
            <small>ใช้จับคู่ clock-in จาก StoreHub กับคนนี้ — ถ้าชื่อใน StoreHub ไม่ตรง เวลาเข้างานจะหาย</small>
          </label>
        </div>

        <div className="staff-form__actions">
          <button type="submit" className="primary-action">{isNew ? "เพิ่มพนักงาน" : "บันทึก"}</button>
        </div>
      </form>

      {!isNew && !isSelf ? (
        <form action={removeAction} className="staff-form__remove">
          <input type="hidden" name="email" value={record.email} />
          <button type="submit" className="staff-form__delete">ลบออกจากระบบ</button>
        </form>
      ) : null}
    </article>
  );
}

export function StaffManager({ staff, branches, currentEmail, saveAction, removeAction }: StaffManagerProps) {
  const roster = staff.filter((record) => record.onRoster);
  const others = staff.filter((record) => !record.onRoster);

  return (
    <div className="staff-manager">
      <StaffForm branches={branches} saveAction={saveAction} removeAction={removeAction} />

      <section>
        <p className="eyebrow">พนักงานหน้าร้าน ({roster.length})</p>
        {roster.map((record) => (
          <StaffForm
            key={record.email}
            record={record}
            branches={branches}
            saveAction={saveAction}
            removeAction={removeAction}
            isSelf={record.email === currentEmail}
          />
        ))}
      </section>

      {others.length ? (
        <section>
          <p className="eyebrow">บัญชีที่ไม่อยู่ในตารางกะ ({others.length})</p>
          {others.map((record) => (
            <StaffForm
              key={record.email}
              record={record}
              branches={branches}
              saveAction={saveAction}
              removeAction={removeAction}
              isSelf={record.email === currentEmail}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
