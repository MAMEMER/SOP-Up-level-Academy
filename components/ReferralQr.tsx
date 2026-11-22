"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ReferralQr({ code, name, count }: { code: string; name: string; count: number | null }) {
  const [image, setImage] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const link = `https://guild.uplevelguild.com/register?staff=${encodeURIComponent(code)}`;
  useEffect(() => { let active = true; QRCode.toDataURL(link, { width: 440, margin: 2 }).then(url => { if (active) setImage(url); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [link]);
  return <section className="owner-ops__panel"><h3>QR ชวนสมาชิกของฉัน</h3>
    {image && <img src={image} width={220} height={220} alt="QR สำหรับสมัครสมาชิก" style={{ maxWidth: "100%", height: "auto" }} />}
    {error && <p>สร้าง QR ไม่สำเร็จ กรุณาลองใหม่</p>}
    <p>สแกนเพื่อสมัครสมาชิก</p><p>{name} · {code}</p>
    <p>{count === null ? "โหลดจำนวนผู้สมัครไม่สำเร็จ" : `เดือนนี้ชวนสำเร็จ ${count} คน`}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button type="button" style={{ minHeight: 44 }} onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError(true); } }}>{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</button>
      {image && <a href={image} download={`referral-${code}.png`} style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>บันทึกรูป QR</a>}</div>
  </section>;
}
