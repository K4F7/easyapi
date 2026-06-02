"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiPost } from "@/lib/client/api";
import { formatDateTime } from "@/lib/client/format";

type MeResponse = {
  user: {
    id: string;
    email: string;
    inviteCode: string;
    newApiUserId: string | null;
    newApiBinding: "ready" | "pending";
    createdAt: string;
  };
};

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMe() {
    setError(null);
    setLoading(true);

    try {
      setMe(await apiFetch<MeResponse>("/api/auth/me"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "账户加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await apiPost("/api/auth/logout");
      router.push("/login");
      router.refresh();
    } catch (logoutError) {
      toast.error(
        logoutError instanceof Error ? logoutError.message : "退出登录失败",
      );
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    void loadMe();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <ErrorState
          title="账户加载失败"
          description={error ?? "请稍后重试"}
          actionLabel="重新加载"
          onAction={loadMe}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看你的账户信息，或者退出当前登录。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMe}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
          <CardDescription>你当前登录账户的基本资料。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow label="邮箱" value={me.user.email} />
          <InfoRow label="用户 ID" value={me.user.id} />
          <InfoRow label="邀请码" value={me.user.inviteCode} />
          <InfoRow label="创建时间" value={formatDateTime(me.user.createdAt)} />
          <div className="flex flex-col gap-1 border-t border-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">NewAPI 绑定</div>
            <Badge variant={me.user.newApiBinding === "ready" ? "secondary" : "outline"}>
              {me.user.newApiBinding === "ready" ? "已就绪" : "处理中"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登录状态</CardTitle>
          <CardDescription>退出后你需要重新登录才能使用。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={loggingOut}
            variant="destructive"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "退出中..." : "退出登录"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all text-sm font-medium">{value}</div>
    </div>
  );
}
