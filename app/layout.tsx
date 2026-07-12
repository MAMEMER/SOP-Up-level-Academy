import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOP_UPLEVEL",
  description: "Public UPMAN operations manual and checklist",
  icons: {
    icon: "/up-level-academy-logo.png",
    apple: "/up-level-academy-logo.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
