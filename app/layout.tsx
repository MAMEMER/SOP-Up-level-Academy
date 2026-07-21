import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOP · Up Level Guild",
  description: "คู่มือการทำงาน + KPI พนักงาน Up Level Academy",
  icons: {
    icon: "/up-level-academy-logo.png",
    apple: "/up-level-academy-logo.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
