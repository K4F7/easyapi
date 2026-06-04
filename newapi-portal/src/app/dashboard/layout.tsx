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
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 hidden w-64 bg-muted/30 md:block">
          <div className="flex h-16 items-center gap-3 px-5">
            <DuckLogo />
            <div>
              <div className="text-sm font-semibold">EZAPI 控制台</div>
              <div className="text-xs text-muted-subtle">Console</div>
            </div>
          </div>
          <div className="px-3 py-2">
            <DashboardNav />
          </div>
        </aside>

        <div className="md:pl-64">
          <div className="sticky top-0 z-20">
            <header className="flex h-16 items-center justify-between bg-background/95 px-4 backdrop-blur md:px-6 border-b border-divider md:border-none">
              <Link href="/" className="flex items-center gap-2 md:hidden">
                <DuckLogo className="h-7 w-7" />
                <span className="text-sm font-semibold">控制台</span>
              </Link>
              <div className="hidden text-sm text-muted-foreground md:block">
                客户控制台
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label="通知">
                  <Bell className="h-4 w-4" />
                </Button>
                <UserMenu email={user.email} />
              </div>
            </header>
            <div className="bg-background/95 backdrop-blur md:hidden border-b border-divider">
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
