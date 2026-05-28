import type { Metadata } from "next";
import { Toaster } from "sonner";

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
      <body className="font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
