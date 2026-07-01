"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase/browser.ts";

export default function LoginPage() {
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
  }

  return (
    <main className="page auth-page">
      <section className="panel auth-panel">
        <h1>SOP Library</h1>
        <p>เข้าสู่ระบบด้วยอีเมลบริษัท</p>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
        />
        <button onClick={signIn}>ส่งลิงก์เข้าสู่ระบบ</button>
        {sent ? <p>ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาเช็กอีเมล</p> : null}
      </section>
    </main>
  );
}
