"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  email: string;
};

export function UserMenu({ email }: UserMenuProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      // ignore — redirect anyway
      router.push("/login");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {email}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>账户</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard")}>
          个人资料
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
