import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智销 AI · 销转智能工作台",
  description: "面向企业销售团队的 AI 销转智能工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
