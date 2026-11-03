import type { Metadata } from "next";
import { Mitr, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { LazyFabs } from "../components/LazyFabs.tsx";
import { SupportFab } from "../components/SupportFab.tsx";

// Self-hosted via next/font (no render-blocking Google Fonts request). Exposed as CSS
// variables that globals.css uses in its font stacks (--guild-font, body).
const mitr = Mitr({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-mitr"
});
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans-thai"
});

export const metadata: Metadata = {
  title: "SOP · Up Level Guild",
  description: "คู่มือการทำงาน + KPI พนักงาน Up Level Academy",
  icons: {
    icon: { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${mitr.variable} ${notoSansThai.variable}`}>
      <body>
        {children}
        <LazyFabs />
        <SupportFab />
      </body>
    </html>
  );
}
