"use client";

// One floating help button instead of two. Chat (purple) and bug (orange) used to be two
// 52px saturated discs stacked on the right of every page, sitting on live content mid-screen
// on a 390px phone. Now a single 44px neutral button opens a 2-item menu; the panels still
// live in HelpChat / BugReportFab — this only fires their open events.

import { useEffect, useRef, useState } from "react";
import { Bug, MessageCircle, MessageCircleQuestion, X } from "lucide-react";

export const OPEN_CHAT_EVENT = "sop:open-chat";
export const OPEN_BUG_EVENT = "sop:open-bug";

export function SupportFab() {
  const [menu, setMenu] = useState(false);
  const [away, setAway] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tuck away while scrolling down so it never parks on what the user is reading.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setAway(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const fire = (name: string) => {
    setMenu(false);
    window.dispatchEvent(new Event(name));
  };

  return (
    <div ref={rootRef} className={`support-fab${away && !menu ? " is-away" : ""}`}>
      {menu && (
        <div role="menu" className="support-fab-menu">
          <button role="menuitem" onClick={() => fire(OPEN_CHAT_EVENT)}>
            <MessageCircle size={16} aria-hidden /> ถามผู้ช่วย
          </button>
          <button role="menuitem" onClick={() => fire(OPEN_BUG_EVENT)}>
            <Bug size={16} aria-hidden /> แจ้งบัค / แนะนำ
          </button>
        </div>
      )}
      <button
        className="support-fab-btn"
        onClick={() => setMenu((m) => !m)}
        aria-label="ช่วยเหลือ: ถามผู้ช่วย / แจ้งบัค"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        {menu ? <X size={20} aria-hidden /> : <MessageCircleQuestion size={20} aria-hidden />}
      </button>
    </div>
  );
}
