"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChartNoAxesColumn,
  CreditCard,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  onboardingTarget?: string;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "总览", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/tokens", label: "令牌", icon: KeyRound },
  { href: "/dashboard/billing", label: "充值", icon: CreditCard },
  { href: "/dashboard/usage", label: "用量", icon: ChartNoAxesColumn },
  {
    href: "/dashboard/playground",
    label: "操练场",
    icon: FlaskConical,
    onboardingTarget: "playground-entry",
  },
  {
    href: "/dashboard/docs",
    label: "文档",
    icon: BookOpen,
    badge: "WIP",
  },
  { href: "/dashboard/profile", label: "设置", icon: UserRound },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="控制台导航"
      className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] md:block md:space-y-1.5 md:overflow-visible md:p-0 [&::-webkit-scrollbar]:hidden"
    >
      {navItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-onboarding-target={item.onboardingTarget}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:gap-3",
              active &&
                "bg-primary/10 text-foreground shadow-sm shadow-primary/10 hover:bg-primary/10 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">{item.label}</span>
            {item.badge ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
