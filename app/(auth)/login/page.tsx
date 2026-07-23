"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../../lib/firebase-client.ts";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else if (res.status === 403) {
        setError("อีเมลนี้ยังไม่มีสิทธิ์เข้าระบบ — ติดต่อแอดมินให้เพิ่มสิทธิ์");
        await auth.signOut();
      } else {
        setError("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } catch {
      setError("ยกเลิก/เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page auth-page">
      <section className="auth-shell">
        <div className="auth-brand">
          <img src="/up-level-academy-logo.png" alt="Up Level Academy" />
          <div>
            <span>UPMAN Operations</span>
            <h1>Up Level Academy</h1>
            <p>ศูนย์ควบคุมงาน SOP, checklist, stock และ daily review สำหรับทีมหน้าร้าน</p>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-head">
            <p>Secure sign in</p>
            <h2>เข้าสู่ระบบทีม</h2>
            <span>เข้าด้วยบัญชี Google ของทีม (เฉพาะอีเมลที่มีสิทธิ์)</span>
          </div>
          <button type="button" className="auth-google" onClick={signInWithGoogle} disabled={busy}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
            {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย Google"}
          </button>
          {error ? <p className="auth-error">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
