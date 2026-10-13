import { ClipBriefForm } from "../../../components/ClipBriefForm.tsx";
import { requireUser } from "../../../lib/auth.ts";

// บรีฟคลิป: อัปฟุตเทจเข้า Drive Footage/<หัวข้อ>/ แล้วมากรอกตรงนี้ก่อน Mac mini ตัดอัตโนมัติ
export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ folder?: string | string[] }> };

export default async function ClipBriefPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : {};
  const folder = Array.isArray(params.folder) ? params.folder[0] : params.folder;
  return (
    <main className="page clip-brief">
      <header className="clip-brief__head">
        <p className="eyebrow">ก่อนตัดคลิปอัตโนมัติ</p>
        <h2>บรีฟคลิป</h2>
        <p className="clip-brief__lead">
          อัปฟุตเทจเข้า Drive โฟลเดอร์ Footage แล้ว บอกตรงนี้ว่าคลิปนี้เอาไปทำอะไร ฮุกอยู่ตรงไหน ของเด็ดคืออะไร — AI จะตัดตามนี้แทนการเดา
        </p>
      </header>
      <ClipBriefForm initialFolder={(folder ?? "").slice(0, 200)} submitterName={user.name} canSubmit={!user.isImpersonating} />
    </main>
  );
}
