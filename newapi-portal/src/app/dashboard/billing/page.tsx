"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Gift,
  RefreshCw,
  Clock,
  CheckCircle2,
  Copy,
  ReceiptText,
  ArrowRightLeft,
  Link as LinkIcon,
  CreditCard,
  History,
  ArrowUpRight,
  Sparkles,
  Zap
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/page-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiFetch, apiPost } from "@/lib/client/api";
import { formatCurrencyCny, formatDateTime, statusText, formatCount } from "@/lib/client/format";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import type { QuotaDisplayConfig } from "@/lib/quota/display-config.shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Types from Billing ---
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

// --- Types from Referral ---
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

function isPresetAmount(value: number): value is (typeof AMOUNT_PRESETS)[number] {
  return (AMOUNT_PRESETS as readonly number[]).includes(value);
}

export default function CombinedBillingReferralPage() {
  const { formatQuota, quotaPerCny, config: quotaConfig, applyConfig, refresh } =
    useQuotaFormat();
  
  // Billing States
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceSummary["newApi"] | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [amount, setAmount] = useState("10");
  const [payType, setPayType] = useState<string>(PAY_METHODS[0].value);
  const [creating, setCreating] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  // Referral States
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
      apiFetch<OrdersResponse>("/api/billing/orders").then(d => setOrders(d.orders)).catch(() => {}),
      apiFetch<BalanceSummary>("/api/dashboard/summary")
        .then((d) => {
          setBalance(d.newApi);
          if (d.quotaConfig) {
            applyConfig(d.quotaConfig);
          }
        })
        .catch(() => {}),
      apiFetch<ReferralData>("/api/referral").then(d => setReferralData(d)).catch(() => {}),
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
      const data = await apiPost<CreatePaymentResponse>(
        "/api/billing/epay/create",
        {
          amount: String(amountValue),
          payType,
          productCode: "quota",
          name: "EZAPI 余额充值",
          idempotencyKey: crypto.randomUUID(),
        }
      );
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
      const result = await apiPost<RedeemResponse>("/api/billing/redeem", { code: redeemCode.trim() });
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

  const inviteUrl = origin && referralData ? `${origin}/register?inviteCode=${referralData.inviteCode}` : referralData?.inviteLink || "";
  const rewardTotal = referralData?.rewards.reduce((sum, reward) => sum + reward.amount, 0) || 0;
  const pendingInvites = referralData?.invitedCount.pending || 0;
  const rewardedInvites = referralData?.invitedCount.rewarded || 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 page-transition">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            财务与奖励
            <Sparkles className="w-6 h-6 text-primary" />
          </h1>
          <p className="text-muted-foreground mt-1">管理您的账户余额、充值记录与邀请收益。</p>
        </div>
      </div>

      {/* Top Stats: Balance & Referral */}
      <div className="grid gap-6 xl:grid-cols-2 items-stretch">
        {/* Balance Card */}
        <Card className="relative overflow-hidden border-border/40 bg-foreground text-background shadow-soft rounded-3xl p-8 flex flex-col">
          {/* Geometric Pattern Overlay */}
          <div 
            className="absolute inset-0 opacity-10 pointer-events-none" 
            style={{ 
              backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', 
              backgroundSize: '24px 24px' 
            }} 
          />
          {/* Primary Color Glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary rounded-full mix-blend-screen filter blur-[80px] opacity-30 pointer-events-none" />
          
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2.5 font-medium text-background/80">
                <div className="p-1.5 bg-background/10 rounded-md backdrop-blur-sm">
                  <Wallet className="w-4 h-4" />
                </div>
                当前可用额度
              </div>
              <Badge variant="outline" className="bg-background/10 text-background border-background/20 backdrop-blur-sm font-mono tracking-wider">
                LIVE
              </Badge>
            </div>

            <div className="mb-8">
              <div className="text-5xl sm:text-6xl font-bold tracking-tighter font-mono mb-2">
                {balanceLoading ? <Skeleton className="h-14 w-48 bg-background/20" /> : formatQuota(remaining)}
              </div>
              <div className="text-sm text-background/60 flex items-center gap-2">
                可用额度 <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
              </div>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-4 border-t border-background/10 pt-6 mt-auto">
            <div>
              <div className="text-sm text-background/60 mb-1">历史消耗</div>
              <div className="text-xl font-mono font-medium">
                {balanceLoading ? <Skeleton className="h-7 w-24 bg-background/20" /> : formatQuota(usedQuota)}
              </div>
            </div>
            <div>
              <div className="text-sm text-background/60 mb-1">请求次数</div>
              <div className="text-xl font-mono font-medium">
                {ordersLoading ? <Skeleton className="h-7 w-16 bg-background/20" /> : orders.length}
              </div>
            </div>
          </div>
        </Card>

        {/* Referral Stats Card */}
        <Card className="relative overflow-hidden border-border/40 bg-muted/30 shadow-soft rounded-3xl p-8 flex flex-col">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full mix-blend-multiply filter blur-[60px] pointer-events-none" />
          
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2.5 font-medium text-foreground">
                <div className="p-1.5 bg-background rounded-md shadow-sm border border-border/50">
                  <Gift className="w-4 h-4 text-primary" />
                </div>
                邀请奖励
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-border/60 bg-background hover:bg-muted rounded-full">
                <ArrowRightLeft className="w-3 h-3 mr-1.5" />
                划转收益
              </Button>
            </div>

            <div className="mb-8">
              <div className="text-4xl sm:text-5xl font-bold tracking-tighter font-mono mb-2 text-foreground">
                {referralLoading ? <Skeleton className="h-12 w-40 bg-muted" /> : formatQuota(rewardTotal)}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                累计已发奖励
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-auto space-y-6">
            <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-6">
              <div>
                <div className="text-sm text-muted-foreground mb-1">待确认邀请</div>
                <div className="text-xl font-mono font-medium text-foreground">
                  {referralLoading ? <Skeleton className="h-7 w-24 bg-muted" /> : pendingInvites}
                  <span className="text-sm text-muted-foreground ml-1 font-sans font-normal">人</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">成功邀请</div>
                <div className="text-xl font-mono font-medium text-foreground">
                  {referralLoading ? <Skeleton className="h-7 w-16 bg-muted" /> : rewardedInvites}
                  <span className="text-sm text-muted-foreground ml-1 font-sans font-normal">人</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { title: "分享链接", desc: "把专属邀请链接发给好友" },
                { title: "好友注册", desc: "好友用邀请码完成注册" },
                { title: "奖励到账", desc: "系统结算后额度自动发放" },
              ].map((step, index) => (
                <div key={step.title} className="rounded-2xl border border-border/60 bg-background/80 p-3">
                  <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </div>
                  <div className="text-sm font-medium text-foreground">{step.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.desc}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-2 bg-background p-1.5 pl-4 rounded-full border border-border/60 group-hover:border-primary/30 transition-colors">
                <div className="flex-1 text-sm font-mono truncate text-muted-foreground select-all">
                  {referralLoading ? "加载中..." : inviteUrl}
                </div>
                <Button 
                  size="sm" 
                  onClick={() => copyToClipboard(inviteUrl, "邀请链接已复制")}
                  className="h-9 px-4 shrink-0 shadow-none rounded-full"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  复制
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Middle: Recharge & Redeem */}
      <div className="grid gap-6 xl:grid-cols-2 items-start">
        {/* Recharge Card */}
        <Card className="rounded-[24px] border border-border/50 shadow-sm bg-card p-6 md:p-8">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-1.5">易支付充值</h2>
            <p className="text-sm text-muted-foreground">选择金额与支付方式，确认后跳转支付网关。</p>
          </div>

          <div className="space-y-8">
            {/* Amount Selection */}
            <div>
              <Label className="text-sm font-bold text-foreground mb-3 block">充值金额（CNY）</Label>
              <div className="flex flex-wrap gap-2.5 mb-3">
                {AMOUNT_PRESETS.map(val => (
                  <button 
                    key={val}
                    type="button"
                    onClick={() => setAmount(String(val))}
                    className={cn(
                      "h-9 px-5 rounded-full border text-sm font-medium transition-colors",
                      amountValue === val 
                        ? "bg-[#FF9800] text-white border-[#FF9800]" 
                        : "bg-background text-foreground border-border hover:border-border/80"
                    )}
                  >
                    ¥{val}
                  </button>
                ))}
                <div className="relative">
                  <Input 
                    className={cn(
                      "h-9 w-24 rounded-full text-sm font-medium text-center transition-colors focus-visible:ring-[#FF9800] focus-visible:border-[#FF9800] focus-visible:ring-offset-0",
                      amountValue !== null && !isPresetAmount(amountValue)
                        ? "bg-[#FF9800] text-white border-[#FF9800] placeholder:text-white/70"
                        : "bg-background text-foreground border-border hover:border-border/80"
                    )}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="1"
                    placeholder="自定义"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                ¥{amountValue || 0} → 约 {formatQuota(quotaPreview || 0)} 额度 <span className="text-muted-foreground/60">（预估，以实际到账为准）</span>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <Label className="text-sm font-bold text-foreground mb-3 block">支付方式</Label>
              <div className="space-y-3">
                <button 
                  type="button"
                  onClick={() => setPayType('alipay')}
                  className={cn(
                    "w-full flex items-center justify-between p-3.5 rounded-xl border transition-all",
                    payType === 'alipay' 
                      ? "bg-[#FFF6E5] border-[#FF9800] dark:bg-[#FF9800]/10" 
                      : "bg-background border-border hover:border-border/80"
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-full bg-[#FF9800] flex items-center justify-center text-white">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-foreground text-sm">支付宝</div>
                      <div className="text-xs text-muted-foreground mt-0.5">扫码 / 跳转支付</div>
                    </div>
                  </div>
                  <div className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center",
                    payType === 'alipay' ? "border-[#FF9800]" : "border-muted-foreground/30"
                  )}>
                    {payType === 'alipay' && <div className="w-2 h-2 rounded-full bg-[#FF9800]" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Pay Button */}
            <Button 
              className={cn(
                "w-full h-11 rounded-full text-sm font-bold shadow-none text-white transition-colors disabled:opacity-100",
                amountValue && !creating
                  ? "bg-[#FF9800] hover:bg-[#FF9800]/90"
                  : "bg-[#FCD399] hover:bg-[#FCD399] cursor-not-allowed"
              )}
              onClick={submitOrder}
              disabled={creating || !amountValue}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              去支付 ¥{amountValue || 0}
            </Button>
          </div>
        </Card>

        {/* Redeem Card */}
        <Card className="rounded-[24px] border border-border/50 shadow-sm bg-card p-6 md:p-8">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-1.5">兑换码</h2>
            <p className="text-sm text-muted-foreground">兑换成功后额度将自动到账。</p>
          </div>

          <div className="space-y-8">
            <div>
              <Label className="text-sm font-bold text-foreground mb-3 block">兑换码</Label>
              <Input 
                className="h-11 rounded-full bg-background border-border px-5 text-sm focus-visible:ring-[#FF9800] focus-visible:border-[#FF9800] focus-visible:ring-offset-0" 
                placeholder="请输入兑换码"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
              />
            </div>

            <Button 
              className={cn(
                "w-full h-11 rounded-full text-sm font-bold shadow-none text-white transition-colors disabled:opacity-100",
                redeemCode && !redeeming 
                  ? "bg-[#FF9800] hover:bg-[#FF9800]/90" 
                  : "bg-[#FCD399] hover:bg-[#FCD399] cursor-not-allowed"
              )}
              onClick={handleRedeem} 
              disabled={redeeming || !redeemCode}
            >
              <Gift className="w-4 h-4 mr-2" />
              立即兑换
            </Button>

            <p className="text-xs text-muted-foreground">
              兑换成功后额度会即时加入上方「当前可用额度」。
            </p>
          </div>
        </Card>
      </div>

      {/* History Tables */}
      <Card className="rounded-3xl border-border/40 shadow-soft overflow-hidden">
        <Tabs defaultValue="billing" className="w-full">
          <CardHeader className="pb-0 border-b border-border/40 bg-muted/10">
            <TabsList className="bg-transparent h-auto p-0 border-b-0 space-x-8">
              <TabsTrigger 
                value="billing" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-2 py-4 text-sm font-semibold transition-colors"
              >
                充值记录
              </TabsTrigger>
              <TabsTrigger 
                value="referral"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-2 py-4 text-sm font-semibold transition-colors"
              >
                奖励记录
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="p-0">
            <TabsContent value="billing" className="m-0">
              <div className="overflow-x-auto">
                {ordersLoading ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-12 w-full bg-muted/50" />
                    <Skeleton className="h-12 w-full bg-muted/50" />
                    <Skeleton className="h-12 w-full bg-muted/50" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-12">
                    <EmptyState title="暂无充值记录" description="发起充值后，订单会出现在这里。" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="h-12 font-semibold">时间</TableHead>
                        <TableHead className="h-12 font-semibold">金额</TableHead>
                        <TableHead className="h-12 font-semibold">支付方式</TableHead>
                        <TableHead className="h-12 font-semibold">状态</TableHead>
                        <TableHead className="h-12 font-semibold text-right">额度变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                          <TableCell className="text-muted-foreground font-mono text-sm py-4">
                            {formatDateTime(order.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono font-medium py-4">
                            {formatCurrencyCny(order.amountCents)}
                          </TableCell>
                          <TableCell className="py-4">
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              {order.provider?.includes('alipay') || order.provider?.includes('epay') ? (
                                <><span className="w-2 h-2 rounded-full bg-[#1677FF]" /> 支付宝</>
                              ) : (
                                <><span className="w-2 h-2 rounded-full bg-muted-foreground" /> {order.provider || '—'}</>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge 
                              variant={order.status.toUpperCase() === 'PAID' ? 'success' : order.status.toUpperCase() === 'PENDING' ? 'warning' : 'error'}
                              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
                            >
                              {statusText(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-success font-mono font-medium py-4">
                            {order.quotaAmount !== null ? `+${formatQuota(order.quotaAmount)}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
            <TabsContent value="referral" className="m-0">
              <div className="overflow-x-auto">
                {referralLoading ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-12 w-full bg-muted/50" />
                    <Skeleton className="h-12 w-full bg-muted/50" />
                  </div>
                ) : !referralData?.rewards.length ? (
                  <div className="p-12">
                    <EmptyState title="暂无奖励" description="好友注册成功后，你的奖励记录会显示在这里。" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="h-12 font-semibold">时间</TableHead>
                        <TableHead className="h-12 font-semibold">来源</TableHead>
                        <TableHead className="h-12 font-semibold">状态</TableHead>
                        <TableHead className="h-12 font-semibold text-right">奖励金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referralData.rewards.map((reward) => (
                        <TableRow key={reward.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                          <TableCell className="text-muted-foreground font-mono text-sm py-4">
                            {formatDateTime(reward.createdAt)}
                          </TableCell>
                          <TableCell className="font-medium py-4">
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <Gift className="w-3.5 h-3.5 text-primary" />
                              {reward.metadata?.referredUserId ? `好友 #${(reward.metadata.referredUserId || reward.referralId || '').slice(-6)}` : (reward.reason === 'referral_reward' ? '邀请好友' : reward.reason)}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge 
                              variant={reward.metadata?.quotaApplied !== false ? "success" : "warning"}
                              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5"
                            >
                              {reward.metadata?.quotaApplied !== false ? "已发放" : "待结算"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-primary font-mono font-medium py-4">
                            +{formatQuota(reward.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}



