"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "../../../lib/firebase-client.ts";

// The account Google returned but the SOP allow-list rejected. Captured so we can show
// the user exactly which email was denied and let them ask an admin to approve THAT
// email — instead of a dead-end "ติดต่อแอดมิน" with no way to say which address.
type DeniedAccount = { email: string; name: string; uid: string };

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<DeniedAccount | null>(null);
  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent">("idle");

  // A protected page bounces logged-out / revoked users here with ?denied=1. Explain it
  // instead of showing a blank login form.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("denied")) {
      setError("อีเมลนี้ยังไม่มีสิทธิ์เข้าระบบ — เข้าสู่ระบบด้วย Google อีกครั้งเพื่อขอสิทธิ์");
    }
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    setDenied(null);
    setRequestState("idle");
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
        // capture WHO was rejected before signing out, so we can show it + let them request access
        setDenied({
          email: cred.user.email || "",
          name: cred.user.displayName || "",
          uid: cred.user.uid
        });
        setError(null);
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

  // Files an access request into the shared `tickets` triage queue (same pipeline the
  // bug/suggestion FAB uses), WITH the exact rejected email — so an admin can add it at
  // /admin/staff in one tap. No new backend needed.
  async function requestAccess() {
    if (!denied || requestState === "sending") return;
    setRequestState("sending");
    try {
      await addDoc(collection(db, "tickets"), {
        type: "suggestion",
        title: `ขอสิทธิ์เข้าใช้งาน SOP: ${denied.email || "(ไม่ทราบอีเมล)"}`,
        description:
          `พนักงานขอสิทธิ์เข้าใช้งานระบบ SOP\n` +
          `อีเมล: ${denied.email || "-"}\n` +
          `ชื่อ: ${denied.name || "-"}\n` +
          `วิธีอนุมัติ: เพิ่มอีเมลนี้ที่ /admin/staff (ติ๊ก “เปิดใช้งาน”)`,
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        status: "open",
        notified: false,
        source: "sop",
        userId: denied.uid || null,
        email: denied.email || "",
        displayName: denied.name || "",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now()
      });
      setRequestState("sent");
    } catch {
      setRequestState("idle");
      setError("ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง");
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

          {denied ? (
            <div className="auth-denied">
              <p className="auth-denied-head">อีเมลนี้ยังไม่ได้รับอนุมัติให้เข้าระบบ</p>
              <p className="auth-denied-email">{denied.email || "(ไม่ทราบอีเมล)"}</p>
              {requestState === "sent" ? (
                <p className="auth-denied-ok">
                  ✅ ส่งคำขอให้แอดมินแล้ว — รอแอดมินอนุมัติอีเมลนี้ แล้วลองเข้าสู่ระบบอีกครั้ง
                </p>
              ) : (
                <>
                  <p className="auth-denied-help">
                    กดปุ่มด้านล่างเพื่อส่งอีเมลนี้ให้แอดมินอนุมัติ (แอดมินจะเห็นทันที)
                  </p>
                  <button
                    type="button"
                    className="auth-google auth-request"
                    onClick={requestAccess}
                    disabled={requestState === "sending"}
                  >
                    {requestState === "sending" ? "กำลังส่งคำขอ…" : "ขอสิทธิ์เข้าใช้งาน (แจ้งแอดมิน)"}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
