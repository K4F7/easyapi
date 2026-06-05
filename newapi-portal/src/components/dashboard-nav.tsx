"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesColumn,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Share2,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "总览", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/tokens", label: "令牌", icon: KeyRound },
  { href: "/dashboard/billing", label: "充值", icon: CreditCard },
  { href: "/dashboard/referral", label: "邀请", icon: Share2 },
  { href: "/dashboard/usage", label: "用量", icon: ChartNoAxesColumn },
  { href: "/dashboard/profile", label: "设置", icon: UserRound },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1 py-2 md:block md:space-y-1 md:overflow-visible md:p-3">
      {navItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:gap-3",
              active && "bg-orange-100 text-orange-600 hover:bg-orange-100 hover:text-orange-600",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
