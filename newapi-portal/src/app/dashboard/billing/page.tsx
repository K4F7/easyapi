"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet, Gift, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page-state";
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
import { apiFetch, apiPost } from "@/lib/client/api";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import {
  remainingQuotaFromSelf,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

type CreatePaymentResponse = {
  payment: { method: "GET"; url: string };
  amountCents?: number;
  paymentMethod?: string;
};

type RedeemResponse = {
  redeemed: boolean;
  duplicate: boolean;
  quotaAmount?: number;
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

export default function BillingPage() {
  const { formatBalance, applyConfig, refresh } = useQuotaFormat();

  const [balance, setBalance] = useState<BalanceSummary["newApi"] | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [amount, setAmount] = useState("50");
  const [payType, setPayType] = useState<string>(PAY_METHODS[0].value);
  const [creating, setCreating] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const amountValue = useMemo(() => {
    const normalized = amount.trim();
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [amount]);

  const usedQuota = balance?.self?.used_quota;
  const remaining = remainingQuotaFromSelf(balance?.self);

  async function loadData() {
    setBalanceLoading(true);

    try {
      const data = await apiFetch<BalanceSummary>("/api/dashboard/summary");
      setBalance(data.newApi);
      if (data.quotaConfig) applyConfig(data.quotaConfig);
      await refresh();
    } catch {
      // balance stays stale; user can retry via payment return toast
    } finally {
      setBalanceLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "return") {
        toast.info("支付已返回，正在刷新余额…");
        loadData();
        params.delete("payment");
        const next =
          window.location.pathname +
          (params.toString() ? `?${params.toString()}` : "");
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
          name: "EasyAPI 余额充值",
        },
      );
      toast.success("支付链接已生成，正在前往支付");
      window.location.href = data.payment.url;
    } catch (createError) {
      toast.error(
        createError instanceof Error ? createError.message : "创建订单失败",
      );
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
      const amountText = formatBalance(result.quotaAmount);
      toast.success(
        result.duplicate ? "兑换码已处理过" : `兑换成功：+${amountText}`,
      );
      setRedeemCode("");
      loadData();
    } catch (redeemError) {
      toast.error(
        redeemError instanceof Error ? redeemError.message : "兑换失败",
      );
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-normal">充值</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle>余额充值</CardTitle>
            <CardDescription>查看可用余额并完成充值。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
              <StatItem
                label="可用余额"
                value={formatBalance(remaining)}
                loading={balanceLoading}
              />
              <StatItem
                label="历史消费"
                value={formatBalance(usedQuota)}
                loading={balanceLoading}
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
                充值 ¥{amountValue || 0}，预计到账 ¥{amountValue || 0}（以实际到账为准）
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
            <CardTitle>兑换码</CardTitle>
            <CardDescription>输入兑换码获取余额。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
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
              兑换成功后余额会即时加入可用余额。
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle>充值记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <EmptyState
              title="暂无充值记录"
              description="发起充值后，订单会出现在这里。"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
