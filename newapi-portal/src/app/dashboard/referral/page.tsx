"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/client/api";
import { formatDateTime, formatQuota } from "@/lib/client/format";

type Reward = {
  id: string;
  amount: number;
  reason: string;
  referralId: string | null;
  createdAt: string;
};

type ReferralData = {
  inviteCode: string;
  inviteLink: string;
  invitedCount: {
    total: number;
    pending: number;
    rewarded: number;
    canceled: number;
  };
  rewards: Reward[];
  settlement: {
    attempted: boolean;
    reason?: string;
    settled: number;
    failed: number;
  };
};

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReferral() {
    setError(null);
    setLoading(true);

    try {
      setData(await apiFetch<ReferralData>("/api/referral"));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "邀请数据加载失败",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label}已复制`);
  }

  useEffect(() => {
    void loadReferral();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <ErrorState
          title="邀请数据加载失败"
          description={error ?? "请稍后重试"}
          actionLabel="重新加载"
          onAction={loadReferral}
        />
      </div>
    );
  }

  const rewardTotal = data.rewards.reduce((sum, reward) => sum + reward.amount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">邀请</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          分享邀请码，查看邀请人数和奖励记录。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="累计邀请" value={formatQuota(data.invitedCount.total)} />
        <Metric title="已奖励" value={formatQuota(data.invitedCount.rewarded)} />
        <Metric title="奖励额度" value={formatQuota(rewardTotal)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>邀请入口</CardTitle>
          <CardDescription>注册页会读取 inviteCode query 并自动填充。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="text-sm font-medium">邀请码</div>
            <div className="flex gap-2">
              <Input readOnly value={data.inviteCode} />
              <Button
                aria-label="复制邀请码"
                size="icon"
                variant="outline"
                onClick={() => void copy(data.inviteCode, "邀请码")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">邀请链接</div>
            <div className="flex gap-2">
              <Input className="min-w-0" readOnly value={data.inviteLink} />
              <Button
                aria-label="复制邀请链接"
                size="icon"
                variant="outline"
                onClick={() => void copy(data.inviteLink, "邀请链接")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.settlement.failed > 0 ? (
        <Card className="border-warning/40 bg-primary-soft/40">
          <CardContent className="p-4 text-sm text-muted-foreground">
            有 {data.settlement.failed} 条奖励暂未写入上游额度，后续刷新会继续尝试。
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>奖励记录</CardTitle>
            <CardDescription>最近 50 条邀请奖励。</CardDescription>
          </div>
          <Badge variant="outline">
            待奖励 {formatQuota(data.invitedCount.pending)}
          </Badge>
        </CardHeader>
        <CardContent>
          {data.rewards.length === 0 ? (
            <EmptyState
              title="暂无奖励"
              description="被邀请用户注册后，奖励记录会显示在这里。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>奖励额度</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rewards.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-muted-subtle" />
                        {formatQuota(reward.amount)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-muted-subtle" />
                        {reward.referralId ?? reward.reason}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(reward.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="truncate text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
