import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Page head: eyebrow → headline → thin divider (the editorial pattern; no box).

export function MpHead({
  eyebrow,
  title,
  sub,
  back = { href: "/masterplan", label: "หน้าหลัก Masterplan" },
  children
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
  back?: { href: string; label: string } | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="mp-head">
      {back ? (
        <Link href={back.href} className="mp-back">
          <ArrowLeft size={16} aria-hidden="true" /> {back.label}
        </Link>
      ) : null}
      <p className="mp-eyebrow">{eyebrow}</p>
      <h1 className="mp-title">{title}</h1>
      {sub ? <p className="mp-sub">{sub}</p> : null}
      {children ? <div className="mp-head__actions">{children}</div> : null}
      <hr className="mp-rule" />
    </div>
  );
}
