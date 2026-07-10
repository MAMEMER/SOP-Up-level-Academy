import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOP_UPLEVEL",
  description: "Public UPMAN operations manual and checklist"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
