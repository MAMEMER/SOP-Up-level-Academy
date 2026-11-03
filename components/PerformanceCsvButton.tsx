"use client";

import { Download } from "lucide-react";

/**
 * Read-only CSV download of the on-screen performance-score table for the currently selected
 * round. The CSV string (with its UTF-8 BOM) is built server-side from the same rows the page
 * renders and passed in as a prop, so clicking never hits the server, writes nothing, and
 * exports exactly what is on screen. UTF-8 BOM = Thai opens correctly in Excel.
 */
export function PerformanceCsvButton({ csv, filename }: { csv: string; filename: string }) {
  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="performance-csv-button" onClick={download}>
      <Download size={16} aria-hidden="true" />
      ดาวน์โหลด CSV
    </button>
  );
}
