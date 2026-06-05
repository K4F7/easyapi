"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Gift,
  Copy,
  ArrowRightLeft,
  CreditCard,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, type Variants } from "framer-motion";

import { EmptyState } from "@/components/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch, apiPost } from "@/lib/client/api";
import { formatCurrencyCny, formatDateTime, statusText } from "@/lib/client/format";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import type { QuotaDisplayConfig } from "@/lib/quota/display-config.shared";

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
  { value: "alipay", label: "支付宝", icon: <Wallet className="w-5 h-5" />, color: "#1677FF" },
  { value: "wechat", label: "微信", icon: <Wallet className="w-5 h-5" />, color: "#09B83E" },
] as const;

const AMOUNT_PRESETS = [10, 50, 100, 200, 500] as const;

const ACCENT = "#FF9500";

// Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

function isPresetAmount(value: number): value is (typeof AMOUNT_PRESETS)[number] {
  return (AMOUNT_PRESETS as readonly number[]).includes(value);
}

export default function CombinedBillingReferralPage() {
  const { formatQuota, quotaPerCny, config: quotaConfig, applyConfig, refresh } = useQuotaFormat();
  
  // Billing States
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [balance, setBalance] = useState<BalanceSummary["newApi"] | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [amount, setAmount] = useState("50");
  const [payType, setPayType] = useState<string>(PAY_METHODS[0].value);
  const [creating, setCreating] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [activeTab, setActiveTab] = useState<"billing" | "referral">("billing");

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
  const remaining = typeof quota === "number" && typeof usedQuota === "number" ? Math.max(quota - usedQuota, 0) : quota;

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
          if (d.quotaConfig) applyConfig(d.quotaConfig);
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
    <div className="mx-auto w-full max-w-7xl space-y-12 pb-20">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] bg-zinc-950 p-8 md:p-12 text-zinc-50"
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-500 via-transparent to-transparent" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/20 blur-[80px]" />
        
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">资产中心</h1>
            <p className="text-lg text-zinc-400 max-w-xl">
              管理您的 API 额度、充值记录与邀请收益。透明、高效的财务总览。
            </p>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white backdrop-blur-md">
               <Clock className="w-4 h-4 mr-2" />
               账单明细
             </Button>
          </div>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-8 lg:grid-cols-12"
      >
        {/* Left Column: Balances & Stats (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Balance Card */}
          <motion.div variants={itemVariants} className="group relative overflow-hidden rounded-[2rem] border border-orange-200/50 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:shadow-[0_8px_30px_rgb(255,149,0,0.1)]">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-orange-50 to-transparent opacity-50" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">可用额度</h2>
                    <p className="text-sm text-slate-500 font-medium">实时计算</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-600 px-3 py-1 text-xs font-bold tracking-widest uppercase">
                  <span className="relative flex h-2 w-2 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                  </span>
                  Live
                </Badge>
              </div>

              <div className="mb-10">
                {balanceLoading ? (
                  <Skeleton className="h-16 w-64 rounded-xl" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-slate-900 tabular-nums">
                      {formatQuota(remaining).replace(/[^0-9.,]/g, '')}
                    </span>
                    <span className="text-2xl font-bold text-slate-400">
                      {formatQuota(remaining).replace(/[0-9.,]/g, '')}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-slate-50 p-5 transition-colors group-hover:bg-orange-50/50">
                  <div className="text-sm font-medium text-slate-500 mb-2">历史总消耗</div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {balanceLoading ? <Skeleton className="h-8 w-24" /> : formatQuota(usedQuota)}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-5 transition-colors group-hover:bg-orange-50/50">
                  <div className="text-sm font-medium text-slate-500 mb-2">充值次数</div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {ordersLoading ? <Skeleton className="h-8 w-16" /> : orders.length}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Referral Stats Card */}
          <motion.div variants={itemVariants} className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Gift className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">邀请收益</h2>
              </div>
              <Button variant="ghost" className="rounded-full font-semibold hover:bg-slate-100">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                划转
              </Button>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 mb-8">
              <div>
                <div className="text-sm font-medium text-slate-500 mb-1">累计奖励</div>
                <div className="text-3xl font-black text-orange-500 tabular-nums">
                  {referralLoading ? <Skeleton className="h-9 w-24" /> : formatQuota(rewardTotal)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500 mb-1">成功邀请</div>
                <div className="text-3xl font-bold text-slate-900 tabular-nums">
                  {referralLoading ? <Skeleton className="h-9 w-16" /> : `${rewardedInvites} 人`}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500 mb-1">待确认</div>
                <div className="text-3xl font-bold text-slate-900 tabular-nums">
                  {referralLoading ? <Skeleton className="h-9 w-16" /> : `${pendingInvites} 人`}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-2 flex items-center gap-2 border border-slate-100">
              <div className="flex-1 truncate px-4 font-mono text-sm text-slate-600 select-all">
                {referralLoading ? "加载中..." : inviteUrl}
              </div>
              <Button
                onClick={() => copyToClipboard(inviteUrl, "邀请链接已复制")}
                className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-none font-bold px-6"
              >
                <Copy className="mr-2 h-4 w-4" />
                复制链接
              </Button>
            </div>
          </motion.div>

        </div>

        {/* Right Column: Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Recharge Card */}
          <motion.div variants={itemVariants} className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                快速充值
              </h2>
            </div>

            <div className="space-y-8">
              {/* Amount Selection */}
              <div>
                <Label className="text-sm font-bold text-slate-700 mb-4 block">选择金额 (CNY)</Label>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {AMOUNT_PRESETS.map(val => (
                    <button 
                      key={val}
                      type="button"
                      onClick={() => setAmount(String(val))}
                      className={cn(
                        "relative h-14 rounded-2xl border-2 text-lg font-bold transition-all duration-200 overflow-hidden",
                        amountValue === val 
                          ? "border-orange-500 bg-orange-50 text-orange-600" 
                          : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/30"
                      )}
                    >
                      {amountValue === val && (
                        <motion.div 
                          layoutId="amount-active" 
                          className="absolute inset-0 bg-orange-100/50" 
                          initial={false}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-10">¥{val}</span>
                    </button>
                  ))}
                  <div className="relative h-14 col-span-3 sm:col-span-1">
                    <Input 
                      className={cn(
                        "h-full w-full rounded-2xl border-2 text-center text-lg font-bold transition-all focus-visible:ring-0",
                        amountValue !== null && !isPresetAmount(amountValue)
                          ? "border-orange-500 bg-orange-50 text-orange-600"
                          : "border-slate-200 bg-white text-slate-600 focus-visible:border-orange-500"
                      )}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      type="number"
                      min="1"
                      placeholder="自定义"
                    />
                  </div>
                </div>
                
                <AnimatePresence mode="wait">
                  {amountValue !== null && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-4 text-sm"
                    >
                      <span className="font-medium text-slate-500">预计获得额度</span>
                      <span className="font-bold text-orange-600 flex items-center gap-1">
                        <Sparkles className="w-4 h-4" />
                        {formatQuota(quotaPreview || 0)}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Payment Method */}
              <div>
                <Label className="text-sm font-bold text-slate-700 mb-4 block">支付方式</Label>
                <div className="grid grid-cols-2 gap-3">
                  {PAY_METHODS.map((method) => (
                    <button 
                      key={method.value}
                      type="button"
                      onClick={() => setPayType(method.value)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all",
                        payType === method.value 
                          ? "border-slate-900 bg-slate-900 text-white" 
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-full",
                        payType === method.value ? "bg-white/20" : "bg-slate-100"
                      )}>
                        {method.icon}
                      </div>
                      <span className="font-bold text-sm">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pay Button */}
              <Button 
                className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                style={{ backgroundColor: ACCENT }}
                onClick={submitOrder}
                disabled={creating || !amountValue}
              >
                {creating ? "创建订单中..." : `确认支付 ¥${amountValue || 0}`}
              </Button>
            </div>
          </motion.div>

          {/* Redeem Card */}
          <motion.div variants={itemVariants} className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4">兑换码</h2>
            <div className="flex gap-2">
              <Input 
                className="h-12 rounded-xl border-slate-300 bg-white px-4 font-mono text-sm focus-visible:ring-orange-500 focus-visible:border-orange-500" 
                placeholder="输入兑换码"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value)}
              />
              <Button 
                className="h-12 rounded-xl bg-slate-900 font-bold hover:bg-slate-800 px-6"
                onClick={handleRedeem} 
                disabled={redeeming || !redeemCode}
              >
                兑换
              </Button>
            </div>
          </motion.div>

        </div>
      </motion.div>

      {/* History Section */}
      <motion.div 
        variants={itemVariants} 
        initial="hidden"
        animate="show"
        className="rounded-[2rem] border border-slate-200 bg-white overflow-hidden shadow-sm"
      >
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab("billing")}
            className={cn(
              "flex-1 py-5 text-center text-sm font-bold transition-colors relative",
              activeTab === "billing" ? "text-orange-600" : "text-slate-500 hover:text-slate-900"
            )}
          >
            充值记录
            {activeTab === "billing" && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("referral")}
            className={cn(
              "flex-1 py-5 text-center text-sm font-bold transition-colors relative",
              activeTab === "referral" ? "text-orange-600" : "text-slate-500 hover:text-slate-900"
            )}
          >
            奖励记录
            {activeTab === "referral" && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
            )}
          </button>
        </div>

        <div className="p-0">
          <AnimatePresence mode="wait">
            {activeTab === "billing" ? (
              <motion.div
                key="billing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-x-auto"
              >
                {ordersLoading ? (
                  <div className="p-8 space-y-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-16">
                    <EmptyState title="暂无充值记录" description="发起充值后，订单会出现在这里。" />
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-6 py-4 font-medium">时间</th>
                        <th className="px-6 py-4 font-medium">金额</th>
                        <th className="px-6 py-4 font-medium">方式</th>
                        <th className="px-6 py-4 font-medium">状态</th>
                        <th className="px-6 py-4 font-medium text-right">额度变化</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 font-mono text-slate-500">
                            {formatDateTime(order.createdAt)}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-900">
                            {formatCurrencyCny(order.amountCents)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                              {order.provider?.includes('alipay') ? (
                                <div className="w-6 h-6 rounded-full bg-[#1677FF]/10 flex items-center justify-center text-[#1677FF]"><Wallet className="w-3 h-3" /></div>
                              ) : order.provider?.includes('wechat') ? (
                                <div className="w-6 h-6 rounded-full bg-[#09B83E]/10 flex items-center justify-center text-[#09B83E]"><Wallet className="w-3 h-3" /></div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><CreditCard className="w-3 h-3" /></div>
                              )}
                              {order.provider?.includes('alipay') ? '支付宝' : order.provider?.includes('wechat') ? '微信' : order.provider || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                              order.status.toUpperCase() === 'PAID' ? "bg-emerald-50 text-emerald-600" :
                              order.status.toUpperCase() === 'PENDING' ? "bg-amber-50 text-amber-600" :
                              "bg-red-50 text-red-600"
                            )}>
                              {order.status.toUpperCase() === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> :
                               order.status.toUpperCase() === 'PENDING' ? <Clock className="w-3 h-3" /> :
                               <AlertCircle className="w-3 h-3" />}
                              {statusText(order.status)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600">
                            {order.quotaAmount !== null ? `+${formatQuota(order.quotaAmount)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="referral"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-x-auto"
              >
                {referralLoading ? (
                  <div className="p-8 space-y-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : !referralData?.rewards.length ? (
                  <div className="p-16">
                    <EmptyState title="暂无奖励" description="好友注册成功后，你的奖励记录会显示在这里。" />
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-6 py-4 font-medium">时间</th>
                        <th className="px-6 py-4 font-medium">来源</th>
                        <th className="px-6 py-4 font-medium">状态</th>
                        <th className="px-6 py-4 font-medium text-right">奖励金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {referralData.rewards.map((reward) => (
                        <tr key={reward.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-mono text-slate-500">
                            {formatDateTime(reward.createdAt)}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700">
                            <span className="inline-flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                                <Gift className="w-3 h-3" />
                              </div>
                              {reward.metadata?.referredUserId ? `好友 #${(reward.metadata.referredUserId || reward.referralId || '').slice(-6)}` : (reward.reason === 'referral_reward' ? '邀请好友' : reward.reason)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                              reward.metadata?.quotaApplied !== false ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {reward.metadata?.quotaApplied !== false ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {reward.metadata?.quotaApplied !== false ? "已发放" : "待结算"}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-orange-500">
                            +{formatQuota(reward.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}




