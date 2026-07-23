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
      router.push("/");
    }
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    const origin = window.location.origin;
    if (isPreviewMode()) {
      router.push("/");
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/api/auth/callback` }
    });
    // Supabase redirects the browser to Google; the /api/auth/callback route then
    // exchanges the returned code for a session (same path as the magic link).
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
            <span>ใช้ magic link ผ่านอีเมลบริษัทเพื่อเข้า dashboard ประจำวัน</span>
          </div>
          <label className="auth-field">
            <span>Company email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@uplevelacademy.com"
            />
          </label>
          <button onClick={signIn}>ส่งลิงก์เข้า Dashboard</button>
          {sent ? <p className="auth-success">ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาเช็กอีเมล</p> : null}
          <div className="auth-divider"><span>หรือ</span></div>
          <button type="button" className="auth-google" onClick={signInWithGoogle}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width={18} height={18} />
            เข้าสู่ระบบด้วย Google
          </button>
        </div>
      </section>
    </main>
  );
}
