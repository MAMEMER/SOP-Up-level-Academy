"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { branchColor, branchConfigs } from "../lib/store-config.ts";


type Props = {
  /** ค่าที่เลือกอยู่: "all" หรือ key สาขา */
  value: string;
  /** หน้าที่ดูสองสาขาคู่กันได้ — แสดงปุ่ม "ทั้งสองสาขา" */
  allowAll?: boolean;
};

// ปุ่มสลับสาขาบนหน้าแอดมิน. กดแล้วจำไว้ (คุกกี้) ให้หน้าแอดมินอื่นเปิดสาขาเดิมต่อ.
export function AdminBranchSwitch({ value, allowAll = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const options = [
    ...(allowAll ? [{ key: "all", label: "ทั้งสองสาขา", color: "#5C5D7A" }] : []),
    ...branchConfigs.map((branch) => ({ key: branch.key, label: branch.shortName, color: branchColor(branch.key) }))
  ];

  function pick(key: string) {
    if (key === value) return;
    // หน้าที่ดูสองสาขาได้จำแยกจากหน้าที่ทำงานทีละสาขา (ดู lib/admin-branch.ts)
    const cookie = allowAll ? "sop_admin_view" : "sop_admin_branch";
    document.cookie = `${cookie}=${key}; path=/; max-age=31536000; samesite=lax`;
    const next = new URLSearchParams(params.toString());
    next.set("branch", key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="admin-branch-switch" role="tablist" aria-label="เลือกสาขา">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={option.key === value}
          className={option.key === value ? "is-active" : undefined}
          style={{ ["--branch-color" as string]: option.color }}
          onClick={() => pick(option.key)}
        >
          {option.key !== "all" ? <i aria-hidden /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}
