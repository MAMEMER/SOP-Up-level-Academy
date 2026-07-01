import Link from "next/link";
import { StatusBadge } from "./StatusBadge.tsx";
import type { SopStatus } from "../lib/permissions.ts";

export type SopListItem = {
  id: string;
  title: string;
  status: SopStatus;
  departmentName: string;
};

export function SopList({ items }: { items: SopListItem[] }) {
  return (
    <div className="panel sop-list">
      {items.map((item) => (
        <Link key={item.id} href={`/sops/${item.id}`} className="sop-row">
          <span>{item.title} · {item.departmentName}</span>
          <StatusBadge status={item.status} />
        </Link>
      ))}
    </div>
  );
}
