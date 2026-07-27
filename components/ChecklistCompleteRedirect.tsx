"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Shared "หลังกดส่งงานครบ 100% → กลับหน้า Dashboard" behavior used by every checklist
// (tickets voIikgnzV1yA7vwUw55v + 6oedGQrBTffYRAx6zmJh). When a submit brings a checklist
// to 100%, we show a brief confirmation overlay and then route the staff back to the
// dashboard automatically, so they don't have to hunt for the "← กลับ Dashboard" link.
export function useChecklistCompleteRedirect(delayMs = 1400) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const fired = useRef(false);

  const goToDashboard = useCallback(() => {
    if (fired.current) return; // fire once per submit-complete
    fired.current = true;
    setRedirecting(true);
    window.setTimeout(() => {
      router.push("/");
      router.refresh();
    }, delayMs);
  }, [router, delayMs]);

  return { redirecting, goToDashboard };
}

export function ChecklistCompleteOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="checklist-done-overlay" role="status" aria-live="polite">
      <div className="checklist-done-card">
        <span className="checklist-done-check" aria-hidden="true">✓</span>
        <strong>ส่งงานครบ 100% แล้ว</strong>
        <span>กำลังกลับไปหน้า Dashboard…</span>
      </div>
    </div>
  );
}
