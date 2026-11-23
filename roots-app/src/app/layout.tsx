import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RootPath · 英语词根词缀学习",
  description: "间隔重复驱动的英语词根、前缀、后缀学习小程序",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
