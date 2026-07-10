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
    <div className="work-list">
      {items.map((item) => (
        <Link key={item.id} href={`/sops/${item.id}`} className="work-row">
          <div>
            <strong>{item.title}</strong>
            <span>{item.departmentName}</span>
          </div>
          <StatusBadge status={item.status} />
        </Link>
      ))}
    </div>
  );
}
