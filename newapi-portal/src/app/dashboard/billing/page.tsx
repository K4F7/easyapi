"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Gift,
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
import { apiFetch, apiPost } from "@/lib/client/api";
import {
  formatCurrencyCny,
  formatDateTime,
  statusText,
} from "@/lib/client/format";
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
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

  const quota = balance?.self?.quota;
  const usedQuota = balance?.self?.used_quota;
  const remaining =
    typeof quota === "number" && typeof usedQuota === "number"
      ? Math.max(quota - usedQuota, 0)
      : quota;

  async function loadData() {
    setOrdersLoading(true);
    setBalanceLoading(true);

    Promise.allSettled([
      apiFetch<OrdersResponse>("/api/billing/orders")
        .then((d) => setOrders(d.orders))
        .catch(() => {}),
      apiFetch<BalanceSummary>("/api/dashboard/summary")
        .then((d) => {
          setBalance(d.newApi);
          if (d.quotaConfig) applyConfig(d.quotaConfig);
        })
        .catch(() => {}),
      refresh(),
    ]).finally(() => {
      setOrdersLoading(false);
      setBalanceLoading(false);
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
          idempotencyKey: crypto.randomUUID(),
        },
      );
      toast.success("订单已创建，正在前往支付");
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
      const amountText = formatBalance(
        result.quotaAmount ?? result.ledger?.amount,
      );
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
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
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
                    <TableHead className="text-right">到账金额</TableHead>
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
                        order.provider?.includes("epay")
                          ? "支付宝"
                          : order.provider?.includes("wechat")
                            ? "微信"
                            : order.provider || "—"}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-success tabular-nums">
                        {order.quotaAmount !== null
                          ? `+${formatBalance(order.quotaAmount)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const variant =
    normalized === "PAID"
      ? "success"
      : normalized === "PENDING"
        ? "warning"
        : "error";

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
