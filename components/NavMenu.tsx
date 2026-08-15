"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import {
  adminGroups,
  adminQuickLinks,
  groupOfPath,
  isActivePath,
  quickLinks,
  staffGroups,
  type NavGroup,
  type NavLink
} from "../lib/nav-links.ts";

// เมนูแบบกลุ่ม: มือถือ = ปุ่ม "เมนู" เปิดแผงเดียวจบ (ไม่ใช่ปุ่ม 25 ปุ่มเรียงเต็มจอ)
// เดสก์ท็อป = แถบเดียว แต่ละกลุ่มกดแล้วดรอปลงมา.
export function NavMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const groups: NavGroup[] = isAdmin ? [...staffGroups, ...adminGroups] : staffGroups;
  const tops: NavLink[] = isAdmin ? [...quickLinks, ...adminQuickLinks] : quickLinks;

  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // เปลี่ยนหน้าแล้วปิดแผงเอง — ไม่งั้นบนมือถือแผงบังหน้าที่เพิ่งกดเข้ามา
  useEffect(() => {
    setOpen(false);
    setOpenGroup(null);
  }, [pathname]);

  // เดสก์ท็อป: กดที่อื่นแล้วดรอปดาวน์ต้องปิด ไม่ค้างบังเนื้อหาข้างหลัง
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openGroup]);

  const currentGroup = groupOfPath(groups, pathname);

  return (
    <nav ref={root} className={open ? "nav-menu is-open" : "nav-menu"}>
      <button
        type="button"
        className="nav-menu__toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        เมนู
      </button>

      <div className="nav-menu__panel">
        <div className="nav-menu__tops">
          {tops.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActivePath(link.href, pathname, link.exact) ? "nav-menu__top is-active" : "nav-menu__top"}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {groups.map((group) => {
          const expanded = openGroup === group.key;
          return (
            <div key={group.key} className={expanded ? "nav-group is-open" : "nav-group"}>
              <button
                type="button"
                className={currentGroup === group.key ? "nav-group__button is-current" : "nav-group__button"}
                aria-expanded={expanded}
                onClick={() => setOpenGroup(expanded ? null : group.key)}
              >
                {group.label}
                <ChevronDown size={15} aria-hidden />
              </button>
              {expanded ? (
                <div className="nav-group__list">
                  {group.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={isActivePath(link.href, pathname) ? "is-active" : undefined}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
