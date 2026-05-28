"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Coins,
  Gift,
  KeyRound,
  RefreshCw,
  UsersRound,
} from "lucide-react";
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
import { formatQuota, statusText } from "@/lib/client/format";

type DashboardSummary = {
  user: {
    email: string;
    inviteCode: string;
    newApiBinding: "ready" | "pending";
  };
  newApi: {
    binding: "ready" | "pending";
    status: string;
    message?: string;
    self: {
      quota?: number;
      used_quota?: number;
      request_count?: number;
    } | null;
  };
  tokens: {
    count: number | null;
    status: string;
  };
  usage: {
    today: {
      totals: {
        quota: number;
        count: number;
        tokenUsed: number;
      };
    };
    week: {
      totals: {
        quota: number;
        count: number;
        tokenUsed: number;
      };
    };
  };
  checkin: {
    checkedInToday: boolean;
    checkedInOn: string;
    status: string;
  };
  referral: {
    inviteCode: string;
    inviteLink: string;
    invitedCount: {
      total: number;
      pending: number;
      rewarded: number;
      canceled: number;
    };
    rewardCount: number;
    rewardQuota: number;
  };
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    setError(null);
    setLoading(true);

    try {
      setSummary(await apiFetch<DashboardSummary>("/api/dashboard/summary"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "概览加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin() {
    setCheckingIn(true);

    try {
      await apiPost("/api/checkin");
      toast.success("签到完成");
      await loadSummary();
    } catch (checkinError) {
      toast.error(
        checkinError instanceof Error ? checkinError.message : "签到失败",
      );
    } finally {
      setCheckingIn(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !summary) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <ErrorState
          title="概览加载失败"
          description={error ?? "请稍后重试"}
          actionLabel="重新加载"
          onAction={loadSummary}
        />
      </div>
    );
  }

  const ready = summary.newApi.binding === "ready";
  const quota = summary.newApi.self?.quota;
  const usedQuota = summary.newApi.self?.used_quota;
  const remaining =
    typeof quota === "number" && typeof usedQuota === "number"
      ? Math.max(quota - usedQuota, 0)
      : quota;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看账户余额、用量、Token 和邀请奖励。
          </p>
        </div>
        <Badge variant={ready ? "secondary" : "outline"}>
          {ready ? "NewAPI 已绑定" : "NewAPI 绑定处理中"}
        </Badge>
      </div>

      {!ready ? (
        <Card className="border-warning/40 bg-primary-soft/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
              <div>
                <div className="text-sm font-medium">上游账户尚未就绪</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.newApi.message ??
                    "Token、充值兑换和用量日志会在 NewAPI 绑定完成后可用。"}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadSummary}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="可用余额"
          value={formatQuota(remaining)}
          hint={`累计额度 ${formatQuota(quota)}`}
          icon={Coins}
        />
        <MetricCard
          title="今日用量"
          value={formatQuota(summary.usage.today.totals.quota)}
          hint={`${formatQuota(summary.usage.today.totals.count)} 次请求`}
          icon={BadgeCheck}
        />
        <MetricCard
          title="Token 数"
          value={
            summary.tokens.count === null ? "-" : formatQuota(summary.tokens.count)
          }
          hint={statusText(summary.tokens.status)}
          icon={KeyRound}
        />
        <MetricCard
          title="邀请人数"
          value={formatQuota(summary.referral.invitedCount.total)}
          hint={`奖励 ${formatQuota(summary.referral.rewardQuota)}`}
          icon={UsersRound}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>快捷入口</CardTitle>
            <CardDescription>常用账户操作和 BFF 功能入口。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/dashboard/tokens"
              title="管理 Tokens"
              description="创建、查看 masked key、删除 Token。"
            />
            <QuickLink
              href="/dashboard/billing"
              title="充值与兑换"
              description="易支付充值、兑换码、订单记录。"
            />
            <QuickLink
              href="/dashboard/usage"
              title="用量日志"
              description="按周查看消耗统计和请求日志。"
            />
            <QuickLink
              href="/dashboard/referral"
              title="邀请奖励"
              description="复制邀请链接并查看奖励记录。"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>每日签到</CardTitle>
            <CardDescription>
              {summary.checkin.checkedInOn} · {statusText(summary.checkin.status)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-divider bg-muted/50 p-3">
              <Gift className="h-5 w-5 text-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {summary.checkin.checkedInToday ? "今日已签到" : "今日可签到"}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  签到奖励会通过服务端写入 NewAPI 额度。
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={summary.checkin.checkedInToday || !ready || checkingIn}
              onClick={handleCheckin}
            >
              {checkingIn
                ? "签到中..."
                : summary.checkin.checkedInToday
                  ? "已完成"
                  : "签到领取"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Coins;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        <Icon className="h-4 w-4 text-muted-subtle" />
      </CardHeader>
      <CardContent>
        <div className="truncate text-2xl font-semibold">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-subtle">{hint}</div>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-divider bg-card p-4 transition-colors hover:bg-muted"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <ArrowRight className="h-4 w-4 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {["a", "b", "c", "d"].map((key) => (
          <Card key={key}>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
