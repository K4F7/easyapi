import type { Metadata } from "next";
import { Toaster } from "sonner";

import "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZAPI — 人人都会用的 API 控制台",
  description: "小白也能用的 API 管理控制台",
  icons: {
    icon: [{ url: "/duck.webp", type: "image/webp" }],
    shortcut: "/duck.webp",
    apple: "/duck.webp",
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
