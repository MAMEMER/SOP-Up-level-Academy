"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isPreviewMode, previewLoginEmailCookieName } from "../../../lib/preview-data.ts";
import { createClient } from "../../../lib/supabase/browser.ts";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function signIn() {
    const supabase = createClient();
    const origin = window.location.origin;

    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`
      }
    });

    setSent(true);
    if (isPreviewMode()) {
      document.cookie = `${previewLoginEmailCookieName}=${encodeURIComponent(email.trim())}; path=/; max-age=2592000; SameSite=Lax`;
      router.push("/checklist");
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
            <span>ใช้ magic link ผ่านอีเมลบริษัทเพื่อเข้า checklist ประจำวัน</span>
          </div>
          <label className="auth-field">
            <span>Company email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@uplevelacademy.com"
            />
          </label>
          <button onClick={signIn}>ส่งลิงก์เข้า Checklist</button>
          {sent ? <p className="auth-success">ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาเช็กอีเมล</p> : null}
        </div>
      </section>
    </main>
  );
}
