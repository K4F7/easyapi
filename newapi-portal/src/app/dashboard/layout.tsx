import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { DashboardNav } from "@/components/dashboard-nav";
import { DuckLogo } from "@/components/duck-logo";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { QuotaConfigProvider } from "@/components/quota-config-provider";
import { getCurrentUser } from "@/lib/auth";
import { getQuotaDisplayConfig } from "@/lib/quota/get-display-config";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const quotaConfig = await getQuotaDisplayConfig();

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-slate-50/50 selection:bg-primary selection:text-primary-foreground">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-100 bg-white/80 shadow-sm shadow-slate-200/40 backdrop-blur-md md:block">
          <div className="flex h-16 items-center gap-3 border-b border-slate-100/80 px-5">
            <DuckLogo />
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-800">
                EZAPI 控制台
              </div>
              <div className="text-xs text-muted-subtle">Console</div>
            </div>
          </div>
          <div className="px-3 py-3">
            <DashboardNav />
          </div>
        </aside>

        <div className="md:pl-64">
          <div className="sticky top-0 z-20 border-b border-slate-100/80 bg-white/85 shadow-sm shadow-slate-200/30 backdrop-blur-md md:border-b">
            <header className="flex h-16 items-center justify-between px-4 md:px-6">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
              >
                <DuckLogo className="h-7 w-7" />
                <span className="text-sm font-semibold text-slate-800">
                  控制台
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
            <div className="border-t border-slate-100/80 bg-white/70 backdrop-blur-md md:hidden">
              <DashboardNav />
            </div>
          </div>
          <main className="px-4 py-6 md:px-6">
            <QuotaConfigProvider initialConfig={quotaConfig}>
              {children}
            </QuotaConfigProvider>
          </main>
        </div>
      </div>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
