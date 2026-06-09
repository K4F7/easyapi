"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BookOpen, PanelLeft } from "lucide-react";

import { DashboardNav } from "@/components/dashboard-nav";
import { DuckLogo } from "@/components/duck-logo";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getDocsNavConfig } from "@/lib/docs-site";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "dashboard-sidebar-open";

type DashboardShellProps = {
  email: string;
  children: React.ReactNode;
};

export function DashboardShell({ email, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(true);
  const docsNav = getDocsNavConfig();

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setSidebarOpen(stored === "true");
    }
  }, []);

  const handleNavToggle = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;

    if (isDesktop) {
      setSidebarOpen((previous) => {
        const next = !previous;
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
        return next;
      });
      return;
    }

    setMobileNavOpen((previous) => !previous);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background selection:bg-primary selection:text-primary-foreground">
      <aside
        id="dashboard-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-card/80 shadow-sm shadow-primary/10 backdrop-blur-md transition-[width] duration-200 md:block",
          sidebarOpen ? "w-64" : "w-16",
        )}
      >
        <Link
          href="/"
          aria-label="返回 EasyAPI 首页"
          title={sidebarOpen ? undefined : "EasyAPI"}
          className={cn(
            "flex h-16 items-center border-b border-border outline-none transition-[background-color,box-shadow,padding] duration-200 hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            sidebarOpen ? "gap-3 px-5" : "justify-center px-0",
          )}
        >
          <DuckLogo className={sidebarOpen ? undefined : "h-8 w-8"} />
          <span
            className={cn(
              "text-sm font-semibold tracking-tight text-foreground",
              !sidebarOpen && "sr-only",
            )}
          >
            EasyAPI
          </span>
        </Link>
        <div className={cn("py-3", sidebarOpen ? "px-3" : "px-2")}>
          <DashboardNav collapsed={!sidebarOpen} />
        </div>
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-200",
          sidebarOpen ? "md:pl-64" : "md:pl-16",
        )}
      >
        <div className="sticky top-0 z-20 border-b border-border bg-card/85 shadow-sm shadow-primary/10 backdrop-blur-md md:border-b">
          <header className="flex h-16 items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-2">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="切换导航栏"
                aria-expanded={sidebarOpen}
                aria-controls="dashboard-sidebar"
                className="rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={handleNavToggle}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {docsNav.external ? (
                  <a
                    href={docsNav.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    文档
                  </a>
                ) : (
                  <Link href={docsNav.href}>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    文档
                  </Link>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="通知"
                className="rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
              </Button>
              <UserMenu email={email} />
            </div>
          </header>
          {mobileNavOpen ? (
            <div className="border-t border-border bg-card/70 backdrop-blur-md md:hidden">
              <DashboardNav />
            </div>
          ) : null}
        </div>
        <main className="px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
