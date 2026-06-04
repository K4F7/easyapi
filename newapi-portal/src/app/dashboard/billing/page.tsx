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

const AMOUNT_PRESETS = [10, 20, 50, 100, 200, 500] as const;

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

  const inviteUrl = origin && referralData ? `${origin}/register?aff=${referralData.inviteCode}` : referralData?.inviteLink || "";
  const rewardTotal = referralData?.rewards.reduce((sum, reward) => sum + reward.amount, 0) || 0;
  const pendingReward = referralData?.invitedCount.pending || 0;
  const totalInvited = referralData?.invitedCount.total || 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 page-transition">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            财务与奖励
            <Sparkles className="w-6 h-6 text-primary" />
          </h1>
          <p className="text-muted-foreground mt-1">管理您的账户余额、充值记录与邀请收益。</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        {/* Left Card: Account Recharge */}
        <Card className="overflow-hidden border-border/40 bg-card shadow-soft relative group">
          {/* Top Stats Section - High Contrast */}
          <div className="relative p-8 bg-foreground text-background overflow-hidden">
            {/* Geometric Pattern Overlay */}
            <div 
              className="absolute inset-0 opacity-10 pointer-events-none" 
              style={{ 
                backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', 
                backgroundSize: '24px 24px' 
              }} 
            />
            {/* Primary Color Glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary rounded-full mix-blend-screen filter blur-[80px] opacity-30 pointer-events-none transition-opacity group-hover:opacity-50 duration-700" />
            
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2.5 font-medium text-background/80">
                  <div className="p-1.5 bg-background/10 rounded-md backdrop-blur-sm">
                    <Wallet className="w-4 h-4" />
                  </div>
                  账户余额
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

              <div className="grid grid-cols-2 gap-4 border-t border-background/10 pt-6">
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
            </div>
          </div>
          
          {/* Action Section */}
          <CardContent className="p-8 bg-card">
            <div className="space-y-8">
              {/* Amount Selection */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-sm font-semibold text-foreground">充值金额</Label>
                  <span className="text-xs text-muted-foreground font-mono">
                    {amountValue ? `实付 ¥${amountValue}` : '—'}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {AMOUNT_PRESETS.map(val => (
                    <button 
                      key={val}
                      type="button"
                      onClick={() => setAmount(String(val))}
                      className={cn(
                        "relative p-4 rounded-xl border text-center transition-all duration-200 overflow-hidden",
                        amountValue === val 
                          ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_1px_hsl(var(--primary))]" 
                          : "border-border/60 hover:border-primary/40 hover:bg-muted/30 text-foreground"
                      )}
                    >
                      {amountValue === val && (
                        <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-xl flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      <div className="font-mono font-bold text-xl mb-1">{val}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        USD
                      </div>
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-muted-foreground font-mono">¥</span>
                  </div>
                  <Input 
                    className="pl-8 bg-muted/20 border-border/60 h-12 font-mono text-lg transition-all focus-visible:ring-primary focus-visible:border-primary" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="1"
                    placeholder="自定义金额"
                  />
                  {quotaPreview !== null && (
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                      <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-md">
                        +{formatQuota(quotaPreview)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Methods */}
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block">支付方式</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setPayType('alipay')}
                    className={cn(
                      "flex items-center justify-center gap-2 h-12 rounded-xl border transition-all font-medium",
                      payType === 'alipay' 
                        ? "bg-[#1677FF] text-white border-[#1677FF] shadow-md shadow-[#1677FF]/20" 
                        : "bg-muted/20 text-muted-foreground border-border/60 hover:bg-muted/50"
                    )}
                  >
                    支付宝
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPayType('wechat')}
                    className={cn(
                      "flex items-center justify-center gap-2 h-12 rounded-xl border transition-all font-medium",
                      payType === 'wechat' 
                        ? "bg-[#09B659] text-white border-[#09B659] shadow-md shadow-[#09B659]/20" 
                        : "bg-muted/20 text-muted-foreground border-border/60 hover:bg-muted/50"
                    )}
                  >
                    微信支付
                  </button>
                </div>
              </div>
              
              {/* Pay Button */}
              <Button 
                className="w-full h-14 text-base font-bold shadow-soft transition-all hover:scale-[1.02] active:scale-[0.98]"
                onClick={submitOrder}
                disabled={creating || !amountValue}
              >
                {creating ? (
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-5 h-5 mr-2" />
                )}
                {creating ? "处理中..." : amountValue ? `立即支付 ¥${amountValue}` : "请输入金额"}
              </Button>

              {/* Redeem Code */}
              <div className="pt-6 border-t border-border/40">
                <Label className="text-sm font-semibold text-foreground mb-3 block">兑换码</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      className="pl-10 bg-muted/20 border-border/60 h-11 font-mono transition-colors focus-visible:ring-primary focus-visible:border-primary" 
                      placeholder="输入兑换码"
                      value={redeemCode}
                      onChange={e => setRedeemCode(e.target.value)}
                    />
                  </div>
                  <Button 
                    variant="secondary"
                    onClick={handleRedeem} 
                    disabled={redeeming || !redeemCode}
                    className="h-11 px-6 shrink-0 font-medium"
                  >
                    {redeeming ? "兑换中..." : "兑换"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Card: Referral Reward */}
        <Card className="overflow-hidden border-border/40 bg-card shadow-soft relative group h-full flex flex-col">
          {/* Top Stats Section - Refined Light */}
          <div className="relative p-8 bg-muted/30 border-b border-border/40 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full mix-blend-multiply filter blur-[60px] pointer-events-none" />
            
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2.5 font-medium text-foreground">
                  <div className="p-1.5 bg-background rounded-md shadow-sm border border-border/50">
                    <Gift className="w-4 h-4 text-primary" />
                  </div>
                  邀请奖励
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-border/60 bg-background hover:bg-muted">
                  <ArrowRightLeft className="w-3 h-3 mr-1.5" />
                  划转收益
                </Button>
              </div>

              <div className="mb-8">
                <div className="text-4xl sm:text-5xl font-bold tracking-tighter font-mono mb-2 text-foreground">
                  {referralLoading ? <Skeleton className="h-12 w-40 bg-muted" /> : formatQuota(pendingReward)}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  待划转收益
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">累计收益</div>
                  <div className="text-xl font-mono font-medium text-foreground">
                    {referralLoading ? <Skeleton className="h-7 w-24 bg-muted" /> : formatQuota(rewardTotal)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">成功邀请</div>
                  <div className="text-xl font-mono font-medium text-foreground">
                    {referralLoading ? <Skeleton className="h-7 w-16 bg-muted" /> : totalInvited}
                    <span className="text-sm text-muted-foreground ml-1 font-sans font-normal">人</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <CardContent className="p-8 bg-card flex-1 flex flex-col">
            <div className="space-y-6 flex-1">
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block">您的专属邀请链接</Label>
                <div className="flex items-center gap-2 bg-muted/30 p-1.5 pl-4 rounded-xl border border-border/60 group-hover:border-primary/30 transition-colors">
                  <div className="flex-1 text-sm font-mono truncate text-muted-foreground select-all">
                    {referralLoading ? "加载中..." : inviteUrl}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => copyToClipboard(inviteUrl, "邀请链接已复制")}
                    className="h-9 px-4 shrink-0 shadow-none rounded-lg"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    复制
                  </Button>
                </div>
              </div>

              <div className="bg-muted/20 rounded-xl p-5 border border-border/40">
                <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  奖励规则
                </h4>
                <ul className="space-y-3">
                  {[
                    "邀请好友注册，好友充值后您可获得相应比例的额度奖励。",
                    "奖励将发放至「待划转收益」中。",
                    "您可随时将收益划转至账户余额，用于 API 调用。",
                    "邀请人数无上限，多邀多得。"
                  ].map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                        {idx + 1}
                      </div>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Tables */}
      <Card className="border-border/40 shadow-soft mt-8 overflow-hidden">
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
