import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HiTab · 我的起始页",
  description: "你的个人起始页：搜索、常用网址、待办、笔记与壁纸。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
