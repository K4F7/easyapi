"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Infinity as InfinityIcon,
  Plus,
  Search,
  Trash2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

import { RevealOnceDialog } from "@/components/reveal-once-dialog";
import { ErrorState } from "@/components/page-state";
import type { BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { apiDelete, apiFetch, apiPost, apiPut } from "@/lib/client/api";
import { formatDateTime } from "@/lib/client/format";
import { isManagedPlaygroundToken } from "@/lib/playground/token-identity";
import { useQuotaFormat } from "@/hooks/use-quota-format";

type TokenItem = {
  id: number;
  name: string;
  key?: string;
  status?: number;
  created_time?: number;
  accessed_time?: number;
  expired_time?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
  used_quota?: number;
  group?: string;
};

type TokenPage = {
  items: TokenItem[];
  total: number;
  page?: number;
  page_size?: number;
};

type ChannelTier = {
  id: string;
  label: string;
  group: string;
  stability: string;
  description: string;
  default?: boolean;
};

type ChannelTiersResponse = {
  tiers: ChannelTier[];
  defaultGroup: string;
};

type CreateTokenResponse = {
  token?: TokenItem;
  key: string | null;
  keyReturnedOnce: boolean;
};

type UpdateTokenResponse = {
  token: TokenItem;
};

type TokenStatus = {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
};

const NEVER_EXPIRE_SENTINELS = new Set([-1, 0]);

function isNeverExpire(expiredTime: number | undefined): boolean {
  return expiredTime === undefined || NEVER_EXPIRE_SENTINELS.has(expiredTime);
}

function isPlaygroundToken(token: TokenItem): boolean {
  return isManagedPlaygroundToken(token);
}

function getTierByGroup(tiers: ChannelTier[], group: string | undefined) {
  return group ? tiers.find((tier) => tier.group === group) : undefined;
}

async function fetchChannelTiers(): Promise<ChannelTiersResponse> {
  const response = await apiFetch<ChannelTiersResponse>("/api/channels/tiers");

  if (!response.tiers.length) {
    throw new Error("渠道档位暂不可用，请稍后重试");
  }

  const defaultGroup =
    response.defaultGroup ||
    response.tiers.find((tier) => tier.default)?.group ||
    response.tiers[0]?.group;

  if (!defaultGroup) {
    throw new Error("渠道档位暂不可用，请稍后重试");
  }

  return {
    tiers: response.tiers,
    defaultGroup,
  };
}

/** Derive a semantic status (enabled / disabled / expiring / expired / exhausted). */
function deriveStatus(token: TokenItem): TokenStatus {
  if (token.status !== 1) {
    return { label: "已禁用", variant: "neutral" };
  }

  if (!isNeverExpire(token.expired_time)) {
    const expiresAtMs = (token.expired_time ?? 0) * 1000;
    const now = Date.now();
    if (expiresAtMs <= now) {
      return { label: "已过期", variant: "error" };
    }
    if (expiresAtMs - now <= 3 * 24 * 60 * 60 * 1000) {
      return { label: "即将到期", variant: "warning" };
    }
  }

  if (!token.unlimited_quota) {
    const remain = token.remain_quota ?? 0;
    if (remain <= 0) {
      return { label: "余额耗尽", variant: "error" };
    }
  }

  return { label: "启用", variant: "success" };
}

export default function TokensPage() {
  const { refresh } = useQuotaFormat();
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [channelTiers, setChannelTiers] = useState<ChannelTier[]>([]);
  const [defaultChannelGroup, setDefaultChannelGroup] = useState("");
  const [channelTierError, setChannelTierError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingGroupIds, setUpdatingGroupIds] = useState<Set<number>>(
    () => new Set(),
  );

  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TokenItem | null>(null);

  const loadTokens = useCallback(async () => {
    setError(null);
    setChannelTierError(null);
    setLoading(true);

    try {
      const [pageResult, tiersResult] = await Promise.allSettled([
        apiFetch<TokenPage>("/api/tokens?p=1&size=50"),
        fetchChannelTiers(),
        refresh(),
      ]);

      if (pageResult.status === "rejected") {
        throw pageResult.reason;
      }

      setTokens(pageResult.value.items);

      if (tiersResult.status === "fulfilled") {
        setChannelTiers(tiersResult.value.tiers);
        setDefaultChannelGroup(tiersResult.value.defaultGroup);
      } else {
        setChannelTiers([]);
        setDefaultChannelGroup("");
        setChannelTierError(
          tiersResult.reason instanceof Error
            ? tiersResult.reason.message
            : "渠道档位加载失败",
        );
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "令牌加载失败");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  function handleCreated(key: string | null) {
    setCreateOpen(false);
    if (key) {
      setCreatedKey(key);
      setRevealOpen(true);
    }
    void loadTokens();
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    const token = pendingDelete;
    setDeletingId(token.id);

    try {
      await apiDelete(`/api/tokens/${encodeURIComponent(String(token.id))}`);
      toast.success("令牌已删除");
      setPendingDelete(null);
      await loadTokens();
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error ? deleteError.message : "令牌删除失败",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleChannelChange(token: TokenItem, group: string) {
    if (token.group === group || isPlaygroundToken(token)) {
      return;
    }

    if (channelTierError || !channelTiers.some((tier) => tier.group === group)) {
      toast.error("渠道档位不可用，暂不能更新令牌渠道");
      return;
    }

    setUpdatingGroupIds((current) => {
      const next = new Set(current);
      next.add(token.id);
      return next;
    });

    try {
      const result = await apiPut<UpdateTokenResponse>(
        `/api/tokens/${encodeURIComponent(String(token.id))}`,
        { group },
      );
      setTokens((current) =>
        current.map((item) =>
          item.id === token.id ? { ...item, ...result.token } : item,
        ),
      );
      toast.success("令牌渠道已更新");
    } catch (updateError) {
      toast.error(
        updateError instanceof Error ? updateError.message : "令牌渠道更新失败",
      );
    } finally {
      setUpdatingGroupIds((current) => {
        const next = new Set(current);
        next.delete(token.id);
        return next;
      });
    }
  }

  const channelTiersReady = !channelTierError && channelTiers.length > 0;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return tokens;
    }
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(term) ||
        (token.key ?? "").toLowerCase().includes(term),
    );
  }, [tokens, query]);

  return (
    <div className="mx-auto w-full max-w-5xl pb-16 relative z-10 page-transition home-enter-1">
      <header className="mb-14 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Access Control
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-foreground">
              API 令牌
            </h1>
          </div>
          <p className="text-sm font-medium text-muted-foreground leading-relaxed">
            管理用于访问 API 的鉴权令牌及余额限制。
          </p>
        </div>
        {tokens.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-12 px-6 rounded-xl font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 text-base bg-gray-900 text-white hover:bg-gray-800 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
              disabled={!channelTiersReady}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-5 w-5" />
              创建新令牌
            </Button>
          </div>
        ) : null}
      </header>

      {!loading && !error && channelTierError ? (
        <ChannelTierAlert message={channelTierError} />
      ) : null}

      {loading ? (
        <TokenSkeleton />
      ) : error ? (
        <ErrorState
          title="令牌列表加载失败"
          description={error}
          actionLabel="重新加载"
          onAction={loadTokens}
        />
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-gray-200 dark:border-border/50 bg-white/50 dark:bg-card/20 px-4 py-24 text-center shadow-sm page-transition home-enter-2">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 shadow-sm transition-transform duration-300 hover:scale-110 hover:rotate-[10deg]">
            <KeyRound className="h-10 w-10 text-yellow-600 dark:text-primary" />
          </div>
          <h3 className="mb-2 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-foreground">
            暂无令牌
          </h3>
          <p className="mb-8 max-w-sm text-sm font-medium text-muted-foreground leading-relaxed">
            创建您的第一个 API 令牌，开始将我们的服务集成到您的应用中。
          </p>
          <Button
            className="h-12 px-8 rounded-xl font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 text-base bg-gray-900 text-white hover:bg-gray-800 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
            disabled={!channelTiersReady}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            创建令牌
          </Button>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-white/80 dark:bg-card/80 backdrop-blur-xl border border-gray-100 dark:border-border/50 shadow-sm dark:shadow-2xl rounded-[2rem] page-transition home-enter-2">
          <div className="relative">
            <div className="flex flex-col gap-4 border-b border-gray-100 dark:border-border/50 bg-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-foreground">
                  活动令牌
                </h2>
                <p className="text-sm font-medium text-muted-foreground">
                  出于安全考虑，列表仅显示密钥的掩码。
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  name="search-tokens"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="搜索令牌"
                  className="h-11 pl-9 rounded-xl font-medium bg-gray-50/50 dark:bg-background/50 border-gray-200 dark:border-border/50 focus-visible:ring-1 focus-visible:ring-primary/50 transition-all shadow-sm"
                  placeholder="按名称或密钥搜索…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="p-0">
              {filtered.length === 0 ? (
                <div className="px-4 py-16 text-center text-sm font-medium text-muted-foreground">
                  没有匹配「
                  <span className="break-all text-gray-900 dark:text-foreground font-bold">
                    {query.trim()}
                  </span>
                  」的令牌。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-transparent border-b border-gray-100 dark:border-border/50">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="h-12 pl-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          名称与密钥
                        </TableHead>
                        <TableHead className="h-12 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          状态
                        </TableHead>
                        <TableHead className="h-12 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          渠道
                        </TableHead>
                        <TableHead className="h-12 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          消费 / 限额
                        </TableHead>
                        <TableHead className="h-12 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          到期时间
                        </TableHead>
                        <TableHead className="h-12 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          最近调用
                        </TableHead>
                        <TableHead className="h-12 pr-6 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((token) => (
                        <TokenRow
                          key={token.id}
                          token={token}
                          deleting={deletingId === token.id}
                          channelTiers={channelTiers}
                          channelTiersReady={channelTiersReady}
                          updatingGroup={updatingGroupIds.has(token.id)}
                          onChannelChange={(group) =>
                            handleChannelChange(token, group)
                          }
                          onDelete={() => setPendingDelete(token)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CreateTokenDialog
        open={createOpen}
        channelTiers={channelTiers}
        channelTiersReady={channelTiersReady}
        defaultChannelGroup={defaultChannelGroup}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <RevealOnceDialog
        open={revealOpen}
        onOpenChange={(next) => {
          setRevealOpen(next);
          if (!next) {
            setCreatedKey(null);
          }
        }}
        secret={createdKey ?? ""}
        title="令牌已创建"
        description="这是你的完整 API 密钥，请立即复制并妥善保存。"
        warning="此密钥只显示一次"
      />

      <DeleteTokenDialog
        token={pendingDelete}
        deleting={pendingDelete ? deletingId === pendingDelete.id : false}
        onOpenChange={(next) => {
          if (!next) {
            setPendingDelete(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function TokenRow({
  token,
  deleting,
  channelTiers,
  channelTiersReady,
  updatingGroup,
  onChannelChange,
  onDelete,
}: {
  token: TokenItem;
  deleting: boolean;
  channelTiers: ChannelTier[];
  channelTiersReady: boolean;
  updatingGroup: boolean;
  onChannelChange: (group: string) => void;
  onDelete: () => void;
}) {
  const { formatBalance } = useQuotaFormat();
  const status = deriveStatus(token);
  const unlimited = Boolean(token.unlimited_quota);
  const remain = token.remain_quota ?? 0;
  const used = token.used_quota ?? 0;
  const total = remain + used;
  const usedPct =
    total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const tier = getTierByGroup(channelTiers, token.group);
  const playgroundToken = isPlaygroundToken(token);

  return (
    <TableRow className="group/row transition-colors hover:bg-gray-50/50 dark:hover:bg-muted/20 data-[state=selected]:bg-muted border-b border-gray-100 dark:border-border/20 last:border-0">
      <TableCell className="py-5 pl-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className="max-w-[14rem] truncate font-extrabold text-base text-gray-900 dark:text-foreground"
            title={token.name}
          >
            {token.name}
          </span>
          <div className="flex items-center gap-2">
            <code className="rounded-md border border-gray-200 dark:border-border/50 bg-gray-50 dark:bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
              {token.key ?? "sk-••••"}
            </code>
            {token.key && (
              <CopyButton
                value={token.key}
                variant="ghost"
                size="icon"
                aria-label="复制密钥"
                className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100"
              />
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status.variant === "success"
                ? "bg-success"
                : status.variant === "error"
                  ? "bg-error"
                  : status.variant === "warning"
                    ? "bg-warning"
                    : "bg-neutral",
            )}
          />
          <span className="text-sm font-medium text-muted-foreground">
            {status.label}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <ChannelTierCell
          currentTier={tier}
          group={token.group}
          tiers={channelTiers}
          disabled={playgroundToken || updatingGroup || !channelTiersReady}
          playgroundToken={playgroundToken}
          tiersReady={channelTiersReady}
          updating={updatingGroup}
          onChange={onChannelChange}
        />
      </TableCell>
      <TableCell className="text-right">
        {unlimited ? (
          <span className="inline-flex items-center justify-end gap-1 text-sm font-medium text-muted-foreground">
            <InfinityIcon className="h-3.5 w-3.5" />
            不限
          </span>
        ) : (
          <div className="ml-auto w-32 space-y-1.5">
            <div className="flex justify-between gap-2 font-mono text-[11px] font-bold leading-none tabular-nums">
              <span className="text-gray-900 dark:text-foreground">
                {formatBalance(used)}
              </span>
              <span className="text-muted-foreground">
                {formatBalance(total)}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full border border-gray-200 dark:border-border/50 bg-gray-100 dark:bg-muted/50"
              role="progressbar"
              aria-valuenow={usedPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  usedPct >= 100
                    ? "bg-error shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                    : usedPct >= 80
                      ? "bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      : "bg-success shadow-[0_0_8px_rgba(34,197,94,0.3)] dark:bg-primary dark:shadow-[0_0_8px_rgba(255,255,255,0.3)]",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right text-sm font-medium text-muted-foreground tabular-nums">
        {isNeverExpire(token.expired_time)
          ? "永不过期"
          : formatDateTime(token.expired_time)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right text-sm font-medium text-muted-foreground tabular-nums">
        {formatDateTime(token.accessed_time)}
      </TableCell>
      <TableCell className="pr-6 text-right">
        {playgroundToken ? (
          <span className="text-xs font-medium text-muted-foreground">
            系统托管
          </span>
        ) : (
          <Button
            aria-label={`删除令牌 ${token.name}`}
            className="text-muted-foreground opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 dark:hover:bg-error-soft dark:hover:text-error group-hover/row:opacity-100 rounded-xl"
            disabled={deleting}
            size="icon"
            variant="ghost"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function ChannelTierCell({
  currentTier,
  group,
  tiers,
  disabled,
  playgroundToken,
  tiersReady,
  updating,
  onChange,
}: {
  currentTier: ChannelTier | undefined;
  group: string | undefined;
  tiers: ChannelTier[];
  disabled: boolean;
  playgroundToken: boolean;
  tiersReady: boolean;
  updating: boolean;
  onChange: (group: string) => void;
}) {
  const label = currentTier?.label ?? (group ? "自定义分组" : "未设置");
  const description =
    !tiersReady
      ? "渠道档位不可用"
      : currentTier?.stability ??
        (group ? `NewAPI 分组：${group}` : "旧 Token，沿用上游默认分组");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-auto min-h-10 w-40 justify-between rounded-xl border-gray-200 bg-gray-50/70 px-3 py-2 text-left shadow-sm hover:bg-white dark:border-border/50 dark:bg-background/50 dark:hover:bg-muted/50",
            disabled && "cursor-not-allowed opacity-70",
          )}
          disabled={disabled}
          aria-label={`当前渠道：${label}`}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-gray-900 dark:text-foreground">
              {updating ? "更新中…" : label}
            </span>
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              {playgroundToken ? "操练场 Token 不可编辑" : description}
            </span>
          </span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 rounded-xl p-1.5">
        {tiers.map((tier) => (
          <DropdownMenuItem
            key={tier.group}
            className="items-start gap-2 rounded-lg p-2"
            onSelect={() => onChange(tier.group)}
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {tier.group === group ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                {tier.label}
                {tier.default ? (
                  <span className="rounded-md border border-transparent bg-secondary px-1.5 py-0 text-[10px] font-bold uppercase text-secondary-foreground">
                    默认
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs font-medium leading-relaxed text-muted-foreground">
                {tier.stability} · {tier.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChannelTierAlert({ message }: { message: string }) {
  return (
    <div
      className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm dark:border-error/20 dark:bg-error-soft dark:text-error"
      role="alert"
    >
      <span className="font-extrabold">渠道档位加载失败。</span>
      创建令牌和渠道编辑已暂时禁用，避免提交错误分组。
      <span className="ml-1">{message}</span>
    </div>
  );
}

function ChannelTierPicker({
  tiers,
  value,
  onChange,
}: {
  tiers: ChannelTier[];
  value: string;
  onChange: (group: string) => void;
}) {
  return (
    <div
      className="grid max-h-72 gap-2 overflow-y-auto pr-1"
      role="radiogroup"
      aria-label="渠道档位"
    >
      {tiers.map((tier) => {
        const selected = tier.group === value;

        return (
          <button
            key={tier.group}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              selected
                ? "border-yellow-300 bg-yellow-50 shadow-sm dark:border-primary/40 dark:bg-primary/10"
                : "border-gray-200 bg-gray-50/60 hover:border-gray-300 hover:bg-white dark:border-border/50 dark:bg-background/50 dark:hover:bg-muted/50",
            )}
            onClick={() => onChange(tier.group)}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                selected
                  ? "border-yellow-500 bg-yellow-500 text-white dark:border-primary dark:bg-primary"
                  : "border-gray-300 bg-white dark:border-border dark:bg-card",
              )}
              aria-hidden="true"
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-gray-900 dark:text-foreground">
                {tier.label}
                {tier.default ? (
                  <span className="rounded-md border border-transparent bg-secondary px-1.5 py-0 text-[10px] font-bold uppercase text-secondary-foreground">
                    默认
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs font-bold text-muted-foreground">
                {tier.stability}
              </span>
              <span className="mt-0.5 block text-xs font-medium leading-relaxed text-muted-foreground">
                {tier.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CreateTokenDialog({
  open,
  channelTiers,
  channelTiersReady,
  defaultChannelGroup,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  channelTiers: ChannelTier[];
  channelTiersReady: boolean;
  defaultChannelGroup: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [remainQuota, setRemainQuota] = useState("");
  const [neverExpire, setNeverExpire] = useState(true);
  const [expiredAt, setExpiredAt] = useState("");
  const [group, setGroup] = useState(defaultChannelGroup);
  const groupIsValid = channelTiers.some((tier) => tier.group === group);
  const canCreateWithChannel = channelTiersReady && groupIsValid;

  useEffect(() => {
    if (open) {
      setGroup(defaultChannelGroup);
    }
  }, [defaultChannelGroup, open]);

  function reset() {
    setName("");
    setRemainQuota("");
    setNeverExpire(true);
    setExpiredAt("");
    setGroup(defaultChannelGroup);
  }

  function handleOpenChange(next: boolean) {
    if (!next && !creating) {
      reset();
    }
    onOpenChange(next);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateWithChannel) {
      toast.error("渠道档位不可用，暂不能创建令牌");
      return;
    }

    setCreating(true);

    try {
      const body: {
        name: string;
        remain_quota_cny?: number;
        expired_time?: number;
        group: string;
      } = {
        name: name.trim(),
        group,
      };

      if (remainQuota.trim()) {
        const cny = Number(remainQuota);
        if (!Number.isFinite(cny) || cny <= 0) {
          toast.error("余额上限需为正数（人民币）");
          return;
        }
        body.remain_quota_cny = cny;
      }

      // "永不过期" preserves the original contract by omitting expired_time
      // (upstream default). A picked date is sent as a unix-second timestamp.
      if (!neverExpire && expiredAt) {
        body.expired_time = Math.floor(new Date(expiredAt).getTime() / 1000);
      }

      const result = await apiPost<CreateTokenResponse>("/api/tokens", body);
      toast.success("令牌已创建");
      reset();
      onCreated(result.key);
    } catch (createError) {
      toast.error(
        createError instanceof Error ? createError.message : "令牌创建失败",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[2rem] border-gray-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-border/50 dark:bg-card/95 sm:max-w-md">
        <DialogHeader className="space-y-3 border-b border-gray-100 dark:border-border/50 pb-4">
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-foreground">
            创建新令牌
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">
            配置令牌的名称、余额限制和有效期。
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5 py-4"
          id="create-token-form"
          onSubmit={handleCreate}
        >
          <div className="space-y-2.5">
            <Label
              htmlFor="tokenName"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              名称
            </Label>
            <Input
              id="tokenName"
              name="tokenName"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              className="h-11 rounded-xl font-medium border-gray-200 dark:border-border/50 bg-gray-50 dark:bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary/50 shadow-sm"
              placeholder="例如：生产环境"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="remainQuota"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              余额上限（元）
            </Label>
            <Input
              id="remainQuota"
              name="remainQuota"
              autoComplete="off"
              inputMode="decimal"
              min={0}
              className="h-11 rounded-xl font-medium border-gray-200 dark:border-border/50 bg-gray-50 dark:bg-background/50 tabular-nums transition-all focus-visible:ring-1 focus-visible:ring-primary/50 shadow-sm"
              placeholder="留空则继承默认"
              type="number"
              value={remainQuota}
              onChange={(event) => setRemainQuota(event.target.value)}
            />
            <p className="text-xs font-medium text-muted-foreground">
              留空表示继承上游默认余额上限。
            </p>
          </div>

          <div className="space-y-2.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              渠道档位
            </Label>
            <ChannelTierPicker
              tiers={channelTiers}
              value={group}
              onChange={setGroup}
            />
            {!canCreateWithChannel ? (
              <p className="text-xs font-medium text-red-600 dark:text-error">
                渠道档位不可用，暂不能创建令牌。
              </p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="expiredAt"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              过期时间
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:items-stretch">
              <button
                type="button"
                aria-pressed={neverExpire}
                onClick={() => setNeverExpire((value) => !value)}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm",
                  neverExpire
                    ? "border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-primary/30 dark:bg-primary/10 dark:text-primary shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]"
                    : "border-gray-200 bg-gray-50 text-muted-foreground hover:bg-gray-100 dark:border-border/50 dark:bg-background/50 dark:hover:bg-muted/50 dark:hover:text-foreground",
                )}
              >
                <InfinityIcon className="h-4 w-4" />
                永不过期
              </button>
              <Input
                id="expiredAt"
                name="expiredAt"
                autoComplete="off"
                className={cn(
                  "h-11 flex-1 rounded-xl font-medium border-gray-200 dark:border-border/50 bg-gray-50 dark:bg-background/50 tabular-nums transition-all focus-visible:ring-1 focus-visible:ring-primary/50 shadow-sm",
                  neverExpire && "cursor-not-allowed opacity-50 grayscale",
                )}
                disabled={neverExpire}
                type="datetime-local"
                value={expiredAt}
                onChange={(event) => setExpiredAt(event.target.value)}
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {neverExpire ? "令牌将永不过期。" : "请选择令牌的到期时间。"}
            </p>
          </div>
        </form>

        <DialogFooter className="gap-2 border-t border-gray-100 dark:border-border/50 pt-4 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-muted/50"
            disabled={creating}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="create-token-form"
            disabled={creating || !canCreateWithChannel}
            className="h-10 rounded-xl px-6 font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 bg-gray-900 text-white hover:bg-gray-800 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
          >
            {creating ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-r-transparent" />
                创建中…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                创建
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTokenDialog({
  token,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  token: TokenItem | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(token)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] border-red-200 dark:border-error/20 bg-white/95 dark:bg-card/95 shadow-2xl backdrop-blur-xl sm:max-w-md">
        <DialogHeader className="space-y-3 border-b border-gray-100 dark:border-border/50 pb-4">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-error/10 shadow-sm">
            <Trash2 className="h-8 w-8 text-red-600 dark:text-error" />
          </div>
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-red-600 dark:text-error">
            删除令牌
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">
            确定要删除令牌
            {token ? (
              <span className="font-extrabold text-gray-900 dark:text-foreground">
                {" "}
                「{token.name}」
              </span>
            ) : null}
            吗？此操作不可撤销，使用该密钥的应用将立即失效。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-4 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl font-bold hover:bg-gray-100 dark:hover:bg-muted/50"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 rounded-xl px-6 font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 bg-red-600 text-white hover:bg-red-700 dark:bg-error dark:text-error-foreground dark:hover:bg-error/90 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-foreground border-r-transparent" />
                删除中…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                删除令牌
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenSkeleton() {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-gray-100 dark:border-border/50 bg-white/80 dark:bg-card/80 shadow-sm backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-gray-100 dark:border-border/50 bg-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <Skeleton className="h-11 w-full rounded-xl sm:w-72" />
      </div>
      <div className="p-0">
        <div className="flex items-center border-b border-gray-100 dark:border-border/50 bg-transparent px-6 py-4">
          <Skeleton className="h-4 w-full rounded-md" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-gray-100 dark:border-border/20 px-6 py-5 last:border-0"
          >
            <div className="w-1/4 space-y-2">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
