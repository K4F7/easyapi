"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Activity,
  BadgeCheck,
  CircleAlert,
  Coins,
  Gift,
  KeyRound,
  Plus,
  RefreshCw,
  Wallet,
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
import { CopyButton } from "@/components/ui/copy-button";
import { Sparkline } from "@/components/ui/mini-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch, apiPost } from "@/lib/client/api";
import { formatCount, statusText } from "@/lib/client/format";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import type { QuotaDisplayConfig } from "@/lib/quota/display-config.shared";

type DashboardSummary = {
  quotaConfig?: QuotaDisplayConfig;
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
  logStats: {
    rpm: number | null;
    tpm: number | null;
    status: string;
  };
  checkin: {
    checkedInToday: boolean;
    checkedInOn: string;
    status: string;
    quotaApplied?: boolean | null;
    quotaPending?: boolean;
  };
};

/** 余额告警阈值（人民币）。 */
const BALANCE_LOW_CNY = 1;
const BALANCE_CRITICAL_CNY = 0.2;

/**
 * 对外 API 地址。优先读公开环境变量（构建期注入），否则回退到默认网关域名。
 * 注：summary 接口当前未返回该地址，已在交接报告中标注建议由接口下发。
 */
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_NEWAPI_BASE_URL ?? "https://api.easyapi.work"
).replace(/\/+$/, "");
const API_ENDPOINT = `${API_BASE_URL}/v1`;

export default function DashboardPage() {
  const { formatQuota, quotaToCny, applyConfig, refresh } = useQuotaFormat();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<DashboardSummary>("/api/dashboard/summary");
      setSummary(data);
      if (data.quotaConfig) {
        applyConfig(data.quotaConfig);
      } else {
        await refresh();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "概览加载失败");
    } finally {
      setLoading(false);
    }
  }, [applyConfig, refresh]);

  async function handleCheckin() {
    setCheckingIn(true);

    try {
      await apiPost("/api/checkin");
      toast.success("签到完成");
    } catch (checkinError) {
      toast.error(
        checkinError instanceof Error ? checkinError.message : "签到失败",
      );
    } finally {
      setCheckingIn(false);
      await loadSummary();
    }
  }

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

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

  const remainingCny =
    typeof remaining === "number" ? quotaToCny(remaining) : null;
  const hasBalance = remainingCny !== null;
  const balanceLevel: "ok" | "low" | "critical" = !hasBalance
    ? "ok"
    : remainingCny! <= BALANCE_CRITICAL_CNY
      ? "critical"
      : remainingCny! <= BALANCE_LOW_CNY
        ? "low"
        : "ok";

  const totalRequestCount =
    summary.newApi.self?.request_count ?? summary.usage.week.totals.count;
  const totalTokenUsed = summary.usage.week.totals.tokenUsed;
  const todayTokenUsed = summary.usage.today.totals.tokenUsed;
  const todayRequestCount = summary.usage.today.totals.count;
  const rpm = summary.logStats?.rpm ?? null;
  const tpm = summary.logStats?.tpm ?? null;

  // 今日 vs 本周日均的迷你趋势（接口暂无逐日序列，用现有汇总字段构造 2 点对比）
  const todayQuota = summary.usage.today.totals.quota;
  const weekQuota = summary.usage.week.totals.quota;
  const weekDailyAvg = weekQuota > 0 ? Math.round(weekQuota / 7) : 0;
  const trendData = [weekDailyAvg, todayQuota];
  const hasUsageTrend = ready && (todayQuota > 0 || weekQuota > 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-normal">概览</h1>
        <Badge className="shrink-0" variant={ready ? "success" : "warning"}>
          {ready ? "服务已就绪" : "服务绑定处理中"}
        </Badge>
      </div>

      {!ready ? (
        <Card className="border-warning/40 bg-warning-soft/40 shadow-soft">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
              <div>
                <div className="text-sm font-medium">上游账户尚未就绪</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.newApi.message ??
                    "令牌、充值兑换和用量日志会在账户服务绑定完成后可用。"}
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

      {/* 余额 + 主操作（最强 CTA 留给日用动作：充值 / 新建令牌） */}
      <Card
        className={cn(
          "border-border/60 bg-white/80 shadow-soft backdrop-blur",
          balanceLevel === "critical" && "border-error/40 bg-error-soft/30",
          balanceLevel === "low" && "border-warning/40 bg-warning-soft/30",
        )}
      >
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wallet
                className={cn(
                  "h-4 w-4",
                  balanceLevel === "critical"
                    ? "text-error-foreground"
                    : balanceLevel === "low"
                      ? "text-warning-foreground"
                      : "text-success",
                )}
              />
              <CardDescription>可用余额</CardDescription>
              {balanceLevel === "ok" && hasBalance ? (
                <Badge variant="success">充足</Badge>
              ) : null}
              {balanceLevel === "low" ? (
                <Badge variant="warning">余额偏低</Badge>
              ) : null}
              {balanceLevel === "critical" ? (
                <Badge variant="error">余额不足</Badge>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="truncate text-3xl font-semibold tabular-nums">
                {formatQuota(remaining)}
              </span>
            </div>
            <p
              className={cn(
                "mt-1 text-xs",
                balanceLevel === "critical"
                  ? "text-error-foreground"
                  : balanceLevel === "low"
                    ? "text-warning-foreground"
                    : "text-muted-foreground",
              )}
            >
              {balanceLevel === "critical"
                ? "余额即将耗尽，请尽快充值以免请求中断。"
                : balanceLevel === "low"
                  ? "余额偏低，建议提前充值。"
                  : `账户总额 ${formatQuota(quota)}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard/billing">
                <Coins className="h-4 w-4" />
                去充值
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/tokens">
                <Plus className="h-4 w-4" />
                新建令牌
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API 接入信息：地址可复制，密钥引导去令牌页（概览不下发完整密钥） */}
      <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">接入信息</CardTitle>
          <CardDescription>复制 API 地址，到令牌页取你的密钥。</CardDescription>
        </CardHeader>
        <CardContent
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-onboarding-target="access-info"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">API 地址</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="truncate rounded-md bg-muted px-2 py-1 font-mono text-sm">
                {API_ENDPOINT}
              </code>
              <CopyButton value={API_ENDPOINT} label="一键复制" />
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/tokens">
              <KeyRound className="h-4 w-4" />
              去令牌页取密钥
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          href="/dashboard/usage"
          title="总请求数"
          value={formatCount(totalRequestCount)}
          hint={`今日 ${formatCount(todayRequestCount)} 次`}
          icon={BadgeCheck}
        />
        <MetricCard
          href="/dashboard/usage"
          title="近 7 日用量"
          value={formatQuota(weekQuota)}
          hint={`日均约 ${formatQuota(weekDailyAvg)}`}
          icon={BadgeCheck}
          trend={hasUsageTrend ? trendData : undefined}
        />
        <MetricCard
          href="/dashboard/usage"
          title="总token消耗"
          value={formatCount(totalTokenUsed)}
          hint={`今日 ${formatCount(todayTokenUsed)}`}
          icon={KeyRound}
        />
        <MetricCard
          href="/dashboard/usage"
          title="TPM/RPM"
          value={
            rpm === null && tpm === null
              ? "-"
              : `${formatCount(tpm ?? 0)} / ${formatCount(rpm ?? 0)}`
          }
          hint="今日 token / 请求速率"
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>快捷入口</CardTitle>
            <CardDescription>点这里快速完成常用操作。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/dashboard/tokens"
              title="管理令牌"
              description="新建、查看或删除你的访问令牌。"
              onboardingTarget="token-create"
            />
            <QuickLink
              href="/dashboard/billing"
              title="充值与兑换"
              description="在线充值、核销兑换码、查充值记录。"
            />
            <QuickLink
              href="/dashboard/usage"
              title="用量日志"
              description="看看最近用了多少，哪些请求最费钱。"
            />
            <QuickLink
              href="/dashboard/playground"
              title="打开操练场"
              description="用 Chat 或生图跑一次请求，验证模型接入。"
              onboardingTarget="playground-entry"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>每日签到</CardTitle>
              <Badge
                variant={
                  summary.checkin.quotaPending
                    ? "warning"
                    : summary.checkin.checkedInToday
                      ? "success"
                      : "neutral"
                }
              >
                {summary.checkin.quotaPending
                  ? "额度待发放"
                  : summary.checkin.checkedInToday
                    ? "今日已签到"
                    : "今日可签到"}
              </Badge>
            </div>
            <CardDescription>
              {summary.checkin.checkedInOn} ·{" "}
              {statusText(summary.checkin.status)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
              <Gift className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {summary.checkin.quotaPending
                    ? "签到成功，额度发放中"
                    : summary.checkin.checkedInToday
                      ? "今日已签到"
                      : "今日可签到"}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  每天签到领余额，奖励直接加到你的账户里。
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              variant="outline"
              disabled={
                (summary.checkin.checkedInToday &&
                  !summary.checkin.quotaPending) ||
                !ready ||
                checkingIn
              }
              onClick={handleCheckin}
            >
              {checkingIn
                ? "签到中…"
                : summary.checkin.quotaPending
                  ? "重试发放"
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
  href,
  title,
  value,
  unit,
  hint,
  icon: Icon,
  trend,
}: {
  href: string;
  title: string;
  value: string;
  unit?: string;
  hint: string;
  icon: typeof Coins;
  trend?: number[];
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full border-border/60 bg-white/80 shadow-soft backdrop-blur transition-[background-color,box-shadow] group-hover:bg-white group-hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription>{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="truncate text-2xl font-semibold tabular-nums">
                  {value}
                </span>
                {unit ? (
                  <span className="text-xs text-muted-foreground">{unit}</span>
                ) : null}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {hint}
              </div>
            </div>
            {trend ? (
              <Sparkline
                data={trend}
                width={64}
                height={28}
                className="shrink-0 text-primary"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickLink({
  href,
  title,
  description,
  onboardingTarget,
}: {
  href: string;
  title: string;
  description: string;
  onboardingTarget?: string;
}) {
  return (
    <Link
      href={href}
      data-onboarding-target={onboardingTarget}
      className="group rounded-2xl border border-border/60 bg-white/80 p-4 shadow-soft transition-[background-color,box-shadow] hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
      <Card>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
