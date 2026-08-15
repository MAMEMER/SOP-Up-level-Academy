"use client";

import { useEffect } from "react";

// หน้าต่างฟอร์มที่เปิดเมื่อกด — บนมือถือกางเต็มจอแล้วเลื่อนในตัวเอง เพื่อไม่ต้องวางฟอร์มยาว
// ค้างไว้บนหน้าตลอดเวลา. Esc / กดพื้นหลัง / ปุ่มปิด = ปิดได้ทั้งสามทาง.
export function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-sheet__head">
          <strong>{title}</strong>
          <button type="button" className="modal-sheet__close" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="modal-sheet__body">{children}</div>
      </div>
    </div>
  );
}
