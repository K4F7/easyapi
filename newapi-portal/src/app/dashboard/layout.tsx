import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { DashboardNav } from "@/components/dashboard-nav";
import { DuckLogo } from "@/components/duck-logo";
import { OnboardingTour } from "@/components/onboarding-tour";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-background selection:bg-primary selection:text-primary-foreground">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card/80 shadow-sm shadow-primary/10 backdrop-blur-md md:block">
          <Link
            href="/"
            aria-label="返回 EasyAPI 首页"
            className="flex h-16 items-center gap-3 border-b border-border px-5 outline-none transition-[background-color,box-shadow] duration-200 hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <DuckLogo />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              EasyAPI
            </span>
          </Link>
          <div className="px-3 py-3">
            <DashboardNav />
          </div>
        </aside>

        <div className="md:pl-64">
          <div className="sticky top-0 z-20 border-b border-border bg-card/85 shadow-sm shadow-primary/10 backdrop-blur-md md:border-b">
            <header className="flex h-16 items-center justify-between px-4 md:px-6">
              <Link
                href="/"
                aria-label="返回 EasyAPI 首页"
                className="flex items-center gap-2 rounded-xl outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
              >
                <DuckLogo className="h-7 w-7" />
                <span className="text-sm font-semibold text-foreground">
                  EasyAPI
                </span>
              </Link>
              <div className="hidden text-sm font-medium text-muted-foreground md:block">
                客户控制台
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="通知"
                  className="rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                </Button>
                <UserMenu email={user.email} />
              </div>
            </header>
            <div className="border-t border-border bg-card/70 backdrop-blur-md md:hidden">
              <DashboardNav />
            </div>
          </div>
          <main className="px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
      <OnboardingTour />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
