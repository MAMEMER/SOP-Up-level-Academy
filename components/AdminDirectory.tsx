"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { SiteSection } from "../lib/admin-sitemap.ts";

// สารบัญทุกหน้าบนหน้ารวมเจ้าของ — หมวดเดียวกับเมนูบน + ช่องค้นหา พิมพ์คำไหนก็เจอหน้า
// (ชื่อ คำอธิบาย หรือคำค้นที่ใส่ไว้ เช่น "เงิน" เจอปิดยอด, "กะ" เจอตารางกะ)

export type DirectoryBadge = { count: number; label: string };

export function AdminDirectory({
  sections,
  badges
}: {
  sections: SiteSection[];
  badges: Record<string, DirectoryBadge | undefined>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          links: q
            ? section.links.filter((link) =>
                [link.label, link.detail, link.keywords || "", section.label].join(" ").toLowerCase().includes(q)
              )
            : section.links
        }))
        .filter((section) => section.links.length),
    [sections, q]
  );

  return (
    <section className="admin-dir" aria-label="ทุกเมนู">
      <div className="admin-dir__head">
        <div className="section-heading">
          <p className="eyebrow">ทุกเมนู</p>
          <h3>จะไปหน้าไหน</h3>
        </div>
        <label className="admin-dir__search">
          <Search aria-hidden size={18} />
          <input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาหน้า เช่น กะ, เงิน, สต็อก"
            aria-label="ค้นหาหน้า"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="ล้างคำค้น">
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </label>
      </div>

      {shown.length ? (
        <div className="admin-dir__grid">
          {shown.map((section) => (
            <div key={section.key} className="admin-dir__section">
              <h4>
                {section.label}
                <small>{section.hint}</small>
              </h4>
              <ul>
                {section.links.map((link) => {
                  const badge = badges[link.href];
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className="admin-dir__link">
                        <span className="admin-dir__label">
                          {link.label}
                          {badge ? <em>{badge.count} {badge.label}</em> : null}
                        </span>
                        <small>{link.detail}</small>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-dir__empty">ไม่เจอหน้าที่ตรงกับ &quot;{query}&quot; ลองคำอื่น</p>
      )}
    </section>
  );
}
