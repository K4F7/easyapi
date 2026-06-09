import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { PageTransition } from "@/components/page-transition";
import { cn } from "@/lib/utils";

type AuthShellProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}>;

export function AuthShell({
  title,
  description,
  children,
  className,
}: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background px-4 py-8 selection:bg-primary selection:text-primary-foreground sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-full max-w-3xl -translate-x-1/2 rounded-full bg-primary opacity-5 blur-3xl" />
      <PageTransition
        className={cn(
          "mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[420px] flex-col justify-center",
          className,
        )}
      >
        <div className="mb-7 flex flex-col items-center justify-center gap-4 text-center">
          <Link
            href="/"
            aria-label="返回 EasyAPI 首页"
            className="group flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card/80 p-1.5 shadow-sm shadow-primary/10 backdrop-blur-md transition-transform duration-200 group-hover:scale-[1.03]">
              <BrandMark compact priority className="h-full w-full" />
            </span>
            <span className="text-xl font-bold tracking-normal text-foreground">
              EasyAPI
            </span>
          </Link>
          <div className="max-w-[20rem] space-y-2">
            <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card/80 p-5 shadow-xl shadow-primary/10 backdrop-blur-xl sm:p-6">
          {children}
        </section>
      </PageTransition>
    </main>
  );
}
