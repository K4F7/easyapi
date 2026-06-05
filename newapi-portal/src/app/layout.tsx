import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "EZAPI — 人人都会用的 API 控制台",
  description: "小白也能用的 API 管理控制台",
  icons: {
    icon: [{ url: "/duck-64.webp", type: "image/webp", sizes: "64x64" }],
    shortcut: "/duck-64.webp",
    apple: "/duck-64.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
