"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Gift } from "lucide-react";
import { toast } from "sonner";

import { StatItem } from "@/components/dashboard/stat-item";
import { CopyButton } from "@/components/ui/copy-button";
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
import { useQuotaFormat } from "@/hooks/use-quota-format";
import { apiFetch, apiPost } from "@/lib/client/api";

type AffSummary = {
  aff_code: string;
  aff_count: number;
  aff_quota: number;
  aff_history_quota: number;
};

type AffTransferResponse = {
  transferred: boolean;
  transferred_quota: number;
  aff_quota: number | null;
};

type RedeemResponse = {
  redeemed: boolean;
  duplicate: boolean;
  quotaAmount?: number;
};

type RedeemAffCardProps = {
  onBalanceChange?: () => void | Promise<void>;
  redeemInputId?: string;
  inviteLinkInputId?: string;
};

export function RedeemAffCard({
  onBalanceChange,
  redeemInputId = "redeemCode",
  inviteLinkInputId = "inviteLink",
}: RedeemAffCardProps) {
  const { formatBalance } = useQuotaFormat();
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [aff, setAff] = useState<AffSummary | null>(null);
  const [affLoading, setAffLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [portalOrigin, setPortalOrigin] = useState("");

  const inviteLink = useMemo(() => {
    if (!aff?.aff_code || !portalOrigin) return "";
    return `${portalOrigin}/register?aff_code=${encodeURIComponent(aff.aff_code)}`;
  }, [aff?.aff_code, portalOrigin]);

  async function loadAff() {
    setAffLoading(true);

    try {
      const data = await apiFetch<AffSummary>("/api/aff");
      setAff(data);
    } catch {
      // aff section stays stale; user can retry via transfer refresh
    } finally {
      setAffLoading(false);
    }
  }

  useEffect(() => {
    setPortalOrigin(window.location.origin);
    void loadAff();
  }, []);

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
      await onBalanceChange?.();
    } catch (redeemError) {
      toast.error(
        redeemError instanceof Error ? redeemError.message : "兑换失败",
      );
    } finally {
      setRedeeming(false);
    }
  }

  async function handleAffTransfer() {
    setTransferring(true);
    try {
      const result = await apiPost<AffTransferResponse>("/api/aff");
      const amountText = formatBalance(result.transferred_quota);
      toast.success(`划转成功：+${amountText}`);
      await Promise.all([loadAff(), onBalanceChange?.()]);
    } catch (transferError) {
      toast.error(
        transferError instanceof Error ? transferError.message : "划转失败",
      );
    } finally {
      setTransferring(false);
    }
  }

  return (
    <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle>兑换码</CardTitle>
        <CardDescription>输入兑换码获取余额。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor={redeemInputId}>兑换码</Label>
        <div className="flex gap-2">
          <Input
            id={redeemInputId}
            className="font-mono text-sm"
            placeholder="请输入兑换码"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value)}
          />
          <Button
            className="shrink-0"
            disabled={redeeming || !redeemCode}
            onClick={handleRedeem}
          >
            <Gift className="mr-2 h-4 w-4" />
            兑换
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          兑换成功后余额会即时加入可用余额。
        </p>

        <Separator className="my-4" />

        <div className="space-y-3" data-testid="affiliate-section">
          <div className="space-y-1.5">
            <CardTitle>邀请返利</CardTitle>
            <CardDescription>
              分享邀请链接，好友注册后可获得返利额度。
            </CardDescription>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
            <StatItem
              label="邀请人数"
              value={aff?.aff_count ?? 0}
              loading={affLoading}
            />
            <StatItem
              label="累计返利"
              value={formatBalance(aff?.aff_history_quota)}
              loading={affLoading}
            />
            <StatItem
              label="可划转返利"
              value={formatBalance(aff?.aff_quota)}
              loading={affLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={inviteLinkInputId}>邀请链接</Label>
            <div className="flex gap-2">
              <Input
                id={inviteLinkInputId}
                readOnly
                className="font-mono text-sm"
                value={inviteLink || (affLoading ? "加载中…" : "暂无邀请码")}
              />
              <CopyButton
                value={inviteLink}
                disabled={!inviteLink}
                className="shrink-0"
                label="复制"
                size="sm"
                variant="outline"
              />
            </div>
          </div>

          <Button
            className="w-full"
            variant="outline"
            disabled={
              transferring || affLoading || !aff?.aff_quota || aff.aff_quota <= 0
            }
            onClick={handleAffTransfer}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            {transferring ? "划转中…" : "划转到可用余额"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
