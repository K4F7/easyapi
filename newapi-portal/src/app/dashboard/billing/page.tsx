"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Gift,
  Copy,
  ArrowRightLeft,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page-state";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, apiPost } from "@/lib/client/api";
import { formatCurrencyCny, formatDateTime, statusText } from "@/lib/client/format";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import type { QuotaDisplayConfig } from "@/lib/quota/display-config.shared";

type Order = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  productCode: string;
  quotaAmount: number | null;
  provider: string;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type OrdersResponse = { orders: Order[] };

type CreatePaymentResponse = {
  order: Order;
  payment: { method: "GET"; url: string };
};

type RedeemResponse = {
  redeemed: boolean;
  duplicate: boolean;
  quotaAmount?: number;
  ledger?: { amount: number; createdAt: string };
};

type BalanceSummary = {
  quotaConfig?: QuotaDisplayConfig;
  newApi: {
    binding: "ready" | "pending";
    status: string;
    message?: string;
    self: { quota?: number; used_quota?: number } | null;
  };
};

type RewardMetadata = {
  quotaApplied?: boolean;
  quotaAmount?: number;
  referredUserId?: string;
} | null;

type Reward = {
  id: string;
  amount: number;
  reason: string;
  referralId: string | null;
  metadata: RewardMetadata;
  createdAt: string;
};

type ReferralData = {
  inviteCode: string;
  inviteLink: string;
  invitedCount: { total: number; pending: number; rewarded: number; canceled: number };
  rewards: Reward[];
  settlement: { attempted: boolean; reason?: string; settled: number; failed: number };
};

const PAY_METHODS = [
  { value: "alipay", label: "支付宝" },
  { value: "wechat", label: "微信" },
] as const;

const AMOUNT_PRESETS = [10, 50, 100, 200] as const;

function StatItem({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
        {loading ? (
          <span
            aria-hidden="true"
            className="inline-block h-7 w-20 animate-pulse rounded-md bg-muted align-middle"
          />
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function CombinedBillingReferralPage() {
  const { formatQuota, quotaPerCny, config: quotaConfig, applyConfig, refresh } =
    useQuotaFormat();

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceSummary["newApi"] | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [amount, setAmount] = useState("50");
  const [payType, setPayType] = useState<string>(PAY_METHODS[0].value);
  const [creating, setCreating] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const amountValue = useMemo(() => {
    const normalized = amount.trim();
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [amount]);

  const derivedRate = useMemo(() => {
    for (const order of orders) {
      if (
        order.status.toUpperCase() === "PAID" &&
        typeof order.quotaAmount === "number" &&
        order.quotaAmount > 0 &&
        order.amountCents > 0
      ) {
        return { rate: order.quotaAmount / (order.amountCents / 100), real: true };
      }
    }
    return { rate: quotaPerCny, real: quotaConfig.source === "newapi" };
  }, [orders, quotaPerCny, quotaConfig.source]);

  const quota = balance?.self?.quota;
  const usedQuota = balance?.self?.used_quota;
  const remaining =
    typeof quota === "number" && typeof usedQuota === "number"
      ? Math.max(quota - usedQuota, 0)
      : quota;

  const quotaPreview = amountValue !== null ? Math.round(amountValue * derivedRate.rate) : null;

  async function loadData() {
    setOrdersLoading(true);
    setBalanceLoading(true);
    setReferralLoading(true);

    Promise.allSettled([
      apiFetch<OrdersResponse>("/api/billing/orders").then((d) => setOrders(d.orders)).catch(() => {}),
      apiFetch<BalanceSummary>("/api/dashboard/summary")
        .then((d) => {
          setBalance(d.newApi);
          if (d.quotaConfig) applyConfig(d.quotaConfig);
        })
        .catch(() => {}),
      apiFetch<ReferralData>("/api/referral").then((d) => setReferralData(d)).catch(() => {}),
      refresh(),
    ]).finally(() => {
      setOrdersLoading(false);
      setBalanceLoading(false);
      setReferralLoading(false);
    });
  }

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "return") {
        toast.info("正在刷新余额与充值记录…");
        loadData();
        params.delete("payment");
        const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
        window.history.replaceState(null, "", next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitOrder() {
    if (amountValue === null) {
      toast.error("请输入有效的充值金额（正整数）");
      return;
    }
    setCreating(true);
    try {
      const data = await apiPost<CreatePaymentResponse>("/api/billing/epay/create", {
        amount: String(amountValue),
        payType,
        productCode: "quota",
        name: "EZAPI 余额充值",
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success("订单已创建，正在前往支付");
      window.location.href = data.payment.url;
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "创建订单失败");
    } finally {
      setCreating(false);
    }
  }

  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const result = await apiPost<RedeemResponse>("/api/billing/redeem", {
        code: redeemCode.trim(),
      });
      const amountText = formatQuota(result.quotaAmount ?? result.ledger?.amount);
      toast.success(result.duplicate ? "兑换码已处理过" : `兑换成功：+${amountText}`);
      setRedeemCode("");
      loadData();
    } catch (redeemError) {
      toast.error(redeemError instanceof Error ? redeemError.message : "兑换失败");
    } finally {
      setRedeeming(false);
    }
  }

  const copyToClipboard = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast.success(message);
  };

  const inviteUrl =
    origin && referralData
      ? `${origin}/register?inviteCode=${referralData.inviteCode}`
      : referralData?.inviteLink || "";
  const rewardTotal = referralData?.rewards.reduce((sum, reward) => sum + reward.amount, 0) || 0;
  const pendingInvites = referralData?.invitedCount.pending || 0;
  const rewardedInvites = referralData?.invitedCount.rewarded || 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="rounded-3xl border border-border/50 bg-white/70 p-5 shadow-soft backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-normal">财务与奖励</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理账户余额、充值记录与邀请收益。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle>额度充值</CardTitle>
            <CardDescription>查看可用额度并完成充值。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
              <StatItem
                label="可用额度"
                value={formatQuota(remaining)}
                loading={balanceLoading}
              />
              <StatItem
                label="历史消耗"
                value={formatQuota(usedQuota)}
                loading={balanceLoading}
              />
              <StatItem
                label="充值次数"
                value={orders.length}
                loading={ordersLoading}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>充值金额（CNY）</Label>
              <div className="flex flex-wrap gap-2">
                {AMOUNT_PRESETS.map((val) => (
                  <Button
                    key={val}
                    type="button"
                    size="sm"
                    variant={amountValue === val ? "default" : "outline"}
                    onClick={() => setAmount(String(val))}
                  >
                    ¥{val}
                  </Button>
                ))}
                <Input
                  aria-label="自定义充值金额"
                  className="h-8 w-28"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  min="1"
                  placeholder="自定义"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ¥{amountValue || 0} → 约 {formatQuota(quotaPreview || 0)} 额度（预估，以实际到账为准）
              </p>
            </div>

            <div className="space-y-2">
              <Label>支付方式</Label>
              <div className="flex flex-wrap gap-2">
                {PAY_METHODS.map((method) => (
                  <Button
                    key={method.value}
                    type="button"
                    size="sm"
                    variant={payType === method.value ? "default" : "outline"}
                    onClick={() => setPayType(method.value)}
                  >
                    <Wallet className="mr-1.5 h-3.5 w-3.5" />
                    {method.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              disabled={creating || !amountValue}
              onClick={submitOrder}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {creating ? "创建订单中…" : `去支付 ¥${amountValue || 0}`}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>邀请与兑换</CardTitle>
                <CardDescription>分享邀请链接或输入兑换码获取额度。</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" type="button">
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                划转收益
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
              <StatItem
                label="累计奖励"
                value={formatQuota(rewardTotal)}
                loading={referralLoading}
              />
              <StatItem
                label="成功邀请"
                value={
                  <>
                    {rewardedInvites}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">人</span>
                  </>
                }
                loading={referralLoading}
              />
              <StatItem
                label="待确认"
                value={
                  <>
                    {pendingInvites}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">人</span>
                  </>
                }
                loading={referralLoading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                aria-label="邀请链接"
                className="min-w-0 font-mono text-sm"
                value={referralLoading ? "加载中…" : inviteUrl}
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => copyToClipboard(inviteUrl, "邀请链接已复制")}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                复制
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="redeemCode">兑换码</Label>
              <div className="flex gap-2">
                <Input
                  id="redeemCode"
                  className="font-mono"
                  placeholder="请输入兑换码"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                />
                <Button
                  className="shrink-0"
                  disabled={redeeming || !redeemCode}
                  onClick={handleRedeem}
                >
                  <Gift className="mr-1.5 h-3.5 w-3.5" />
                  兑换
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                兑换成功后额度会即时加入可用额度。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
        <Tabs defaultValue="billing" className="w-full">
          <CardHeader className="pb-0">
            <TabsList>
              <TabsTrigger value="billing">充值记录</TabsTrigger>
              <TabsTrigger value="referral">奖励记录</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <TabsContent value="billing" className="m-0">
              {ordersLoading ? (
                <div className="space-y-3 px-6 pb-6">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : orders.length === 0 ? (
                <div className="px-6 pb-6">
                  <EmptyState
                    title="暂无充值记录"
                    description="发起充值后，订单会出现在这里。"
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>金额</TableHead>
                        <TableHead>支付方式</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">额度变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="whitespace-nowrap font-mono text-sm text-muted-foreground">
                            {formatDateTime(order.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {formatCurrencyCny(order.amountCents)}
                          </TableCell>
                          <TableCell>
                            {order.provider?.includes("alipay") ||
                            order.provider?.includes("epay") ? (
                              "支付宝"
                            ) : order.provider?.includes("wechat") ? (
                              "微信"
                            ) : (
                              order.provider || "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <OrderStatusBadge status={order.status} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-success tabular-nums">
                            {order.quotaAmount !== null
                              ? `+${formatQuota(order.quotaAmount)}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="referral" className="m-0">
              {referralLoading ? (
                <div className="space-y-3 px-6 pb-6">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !referralData?.rewards.length ? (
                <div className="px-6 pb-6">
                  <EmptyState
                    title="暂无奖励"
                    description="好友注册成功后，你的奖励记录会显示在这里。"
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">奖励金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referralData.rewards.map((reward) => (
                        <TableRow key={reward.id}>
                          <TableCell className="whitespace-nowrap font-mono text-sm text-muted-foreground">
                            {formatDateTime(reward.createdAt)}
                          </TableCell>
                          <TableCell>
                            {reward.metadata?.referredUserId
                              ? `好友 #${(reward.metadata.referredUserId || reward.referralId || "").slice(-6)}`
                              : reward.reason === "referral_reward"
                                ? "邀请好友"
                                : reward.reason}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                reward.metadata?.quotaApplied !== false ? "success" : "warning"
                              }
                            >
                              {reward.metadata?.quotaApplied !== false ? "已发放" : "待结算"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-primary tabular-nums">
                            +{formatQuota(reward.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const variant =
    normalized === "PAID" ? "success" : normalized === "PENDING" ? "warning" : "error";

  return (
    <Badge variant={variant} className="gap-1">
      {normalized === "PAID" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : normalized === "PENDING" ? (
        <Clock className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      {statusText(status)}
    </Badge>
  );
}
