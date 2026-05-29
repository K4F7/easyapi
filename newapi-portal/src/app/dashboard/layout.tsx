import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { DashboardNav } from "@/components/dashboard-nav";
import { DuckLogo } from "@/components/duck-logo";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-divider bg-card md:block">
          <div className="flex h-16 items-center gap-3 px-5">
            <DuckLogo />
            <div>
              <div className="text-sm font-semibold">NewAPI Portal</div>
              <div className="text-xs text-muted-subtle">Console</div>
            </div>
          </div>
          <Separator />
          <DashboardNav />
        </aside>

        <div className="md:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-divider bg-background/95 px-4 backdrop-blur md:px-6">
            <Link href="/" className="flex items-center gap-2 md:hidden">
              <DuckLogo className="h-7 w-7" />
              <span className="text-sm font-semibold">Portal</span>
            </Link>
            <div className="hidden text-sm text-muted-foreground md:block">
              客户控制台
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              <UserMenu email={user.email} />
            </div>
          </header>
          <div className="border-b border-divider bg-card md:hidden">
            <DashboardNav />
          </div>
          <main className="px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
