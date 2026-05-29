import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "NewAPI Portal",
  description: "NewAPI customer portal foundation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  );
}
