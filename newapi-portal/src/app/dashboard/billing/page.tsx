"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Gift, RefreshCw } from "lucide-react";
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
import { apiFetch, apiPost } from "@/lib/client/api";
import {
  formatCurrencyCny,
  formatDateTime,
  formatQuota,
  statusText,
} from "@/lib/client/format";

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

type OrdersResponse = {
  orders: Order[];
};

type CreatePaymentResponse = {
  order: Order;
  payment: {
    method: "GET";
    url: string;
  };
};

type RedeemResponse = {
  redeemed: boolean;
  duplicate: boolean;
  quotaAmount?: number;
  ledger?: {
    amount: number;
    createdAt: string;
  };
};

export default function BillingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const [payType, setPayType] = useState("alipay");
  const [creating, setCreating] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const totalRecorded = useMemo(
    () => orders.reduce((sum, order) => sum + order.amountCents, 0),
    [orders],
  );

  async function loadOrders() {
    setOrdersError(null);
    setOrdersLoading(true);

    try {
      const data = await apiFetch<OrdersResponse>("/api/billing/orders");
      setOrders(data.orders);
    } catch (loadError) {
      setOrdersError(
        loadError instanceof Error ? loadError.message : "订单加载失败",
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function handleCreateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);

    try {
      const data = await apiPost<CreatePaymentResponse>(
        "/api/billing/epay/create",
        {
          amount,
          payType,
          productCode: "quota",
          name: "EZAPI 额度充值",
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

  async function handleRedeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRedeeming(true);

    try {
      const result = await apiPost<RedeemResponse>("/api/billing/redeem", {
        code: redeemCode.trim(),
      });
      const amountText = formatQuota(result.quotaAmount ?? result.ledger?.amount);
      toast.success(result.duplicate ? "兑换码已处理过" : `兑换成功：${amountText}`);
      setRedeemCode("");
      await loadOrders();
    } catch (redeemError) {
      toast.error(
        redeemError instanceof Error ? redeemError.message : "兑换失败",
      );
    } finally {
      setRedeeming(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">充值</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用支付宝给账户充值，支付完成后额度自动到账。
          </p>
        </div>
        <Badge variant="outline">本地发起记录 {formatCurrencyCny(totalRecorded)}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>易支付充值</CardTitle>
            <CardDescription>创建订单后会跳转到支付网关。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateOrder}>
              <div className="space-y-2">
                <Label htmlFor="amount">充值金额（CNY）</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  min="1"
                  placeholder="10.00"
                  required
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payType">支付方式</Label>
                <Input
                  id="payType"
                  placeholder="alipay"
                  value={payType}
                  onChange={(event) => setPayType(event.target.value)}
                />
              </div>
              <Button className="w-full" disabled={creating} type="submit">
                <CreditCard className="h-4 w-4" />
                {creating ? "创建中..." : "创建订单"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>兑换码</CardTitle>
            <CardDescription>兑换会由服务端调用 NewAPI 并记录到账本。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleRedeem}>
              <div className="space-y-2">
                <Label htmlFor="redeemCode">兑换码</Label>
                <Input
                  id="redeemCode"
                  maxLength={128}
                  placeholder="请输入兑换码"
                  required
                  value={redeemCode}
                  onChange={(event) => setRedeemCode(event.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={redeeming || redeemCode.trim().length === 0}
                type="submit"
                variant="outline"
              >
                <Gift className="h-4 w-4" />
                {redeeming ? "兑换中..." : "兑换"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>充值记录</CardTitle>
            <CardDescription>这里记录你最近发起的 50 次充值，不包括历史总流水。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadOrders}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ordersError ? (
            <ErrorState
              title="订单加载失败"
              description={ordersError}
              actionLabel="重新加载"
              onAction={loadOrders}
            />
          ) : orders.length === 0 ? (
            <EmptyState title="暂无记录" description="发起充值后，记录会出现在这里。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>到账依据</TableHead>
                  <TableHead>本地状态</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="max-w-[180px] truncate font-medium">
                      {order.id}
                    </TableCell>
                    <TableCell>{formatCurrencyCny(order.amountCents)}</TableCell>
                    <TableCell>{order.quotaAmount === null ? "NewAPI" : formatQuota(order.quotaAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === "PAID" ? "secondary" : "outline"}>
                        {localStatusText(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(order.createdAt)}</TableCell>
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

function localStatusText(status: string) {
  const text = statusText(status);
  return text === status ? `本地 ${status}` : `本地${text}`;
}
