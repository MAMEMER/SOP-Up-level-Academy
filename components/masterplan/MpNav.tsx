"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

// Top nav for /masterplan. Desktop: one row of links. Mobile: brand + current section +
// a menu button that opens the list in normal flow (no overlay covering the page).

export function MpNav({ memberKey, memberName }: { memberKey: string; memberName: string }) {
  const pathname = usePathname() || "/masterplan";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = [
    { href: "/masterplan/plan", label: "ฉบับกลาง", match: ["/masterplan/plan", "/masterplan/docs"] },
    { href: `/masterplan/scratch/${memberKey}`, label: "กระดาษทด", match: ["/masterplan/scratch"] },
    { href: "/masterplan/proposals", label: "ข้อเสนอ", match: ["/masterplan/proposals"] },
    { href: "/masterplan/meeting", label: "คุยวันนี้", match: ["/masterplan/meeting"] },
    { href: "/masterplan/tasks", label: "งาน", match: ["/masterplan/tasks"] },
    { href: "/masterplan/history", label: "ประวัติ", match: ["/masterplan/history"] },
    { href: "/masterplan/ai", label: "AI ของฉัน", match: ["/masterplan/ai"] }
  ];
  const current = items.find((item) => item.match.some((m) => pathname.startsWith(m)));

  return (
    <header className="mp-nav">
      <div className="mp-nav__bar">
        <Link href="/masterplan" className="mp-nav__brand" aria-label="หน้าหลัก Masterplan">
          <span className="mp-nav__mark" aria-hidden="true">U</span>
          <span className="mp-nav__brandtext">Masterplan</span>
        </Link>
        {current ? <span className="mp-nav__current">{current.label}</span> : null}
        <nav className="mp-nav__links" aria-label="เมนู Masterplan">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={current === item ? "is-active" : undefined} aria-current={current === item ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="mp-nav__me" title="บัญชีที่ใช้อยู่">{memberName}</span>
        <button type="button" className="mp-nav__toggle" aria-expanded={open} aria-controls="mp-nav-menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          <span className="mp-sr">เมนู</span>
        </button>
      </div>
      {open ? (
        <nav id="mp-nav-menu" className="mp-nav__menu" aria-label="เมนู Masterplan (มือถือ)">
          <Link href="/masterplan" className={pathname === "/masterplan" ? "is-active" : undefined}>
            หน้าหลัก
          </Link>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={current === item ? "is-active" : undefined}>
              {item.label}
            </Link>
          ))}
          <span className="mp-nav__menu-me">เข้าใช้ในชื่อ {memberName}</span>
        </nav>
      ) : null}
    </header>
  );
}
