"use client";

import dynamic from "next/dynamic";

// The help chat + bug-report modal are only opened on demand (via SupportFab), so their
// code loads after hydration instead of riding in every page's initial bundle.
const HelpChat = dynamic(() => import("./HelpChat.tsx").then((mod) => mod.HelpChat), { ssr: false });
const BugReportFab = dynamic(() => import("./BugReportFab.tsx").then((mod) => mod.BugReportFab), { ssr: false });

export function LazyFabs() {
  return (
    <>
      <HelpChat />
      <BugReportFab />
    </>
  );
}
