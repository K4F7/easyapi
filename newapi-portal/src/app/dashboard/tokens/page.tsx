"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Infinity as InfinityIcon, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { RevealOnceDialog } from "@/components/reveal-once-dialog";
import { EmptyState, ErrorState } from "@/components/page-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { apiDelete, apiFetch, apiPost } from "@/lib/client/api";
import { formatDateTime } from "@/lib/client/format";
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

type CreateTokenResponse = {
  token?: TokenItem;
  key: string | null;
  keyReturnedOnce: boolean;
};

type TokenStatus = {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
};

const NEVER_EXPIRE_SENTINELS = new Set([-1, 0]);

function isNeverExpire(expiredTime: number | undefined): boolean {
  return expiredTime === undefined || NEVER_EXPIRE_SENTINELS.has(expiredTime);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TokenItem | null>(null);

  const loadTokens = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const [page] = await Promise.all([
        apiFetch<TokenPage>("/api/tokens?p=1&size=50"),
        refresh(),
      ]);
      setTokens(page.items);
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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-normal">令牌</h1>
        {tokens.length > 0 ? (
          <Button className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            创建令牌
          </Button>
        ) : null}
      </div>

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
        <EmptyState
          title="还没有令牌"
          description="创建一个就能在这里看到它的状态、剩余余额和最近使用情况。"
          actionLabel="创建第一个令牌"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>令牌列表</CardTitle>
              <CardDescription>
                为了安全，列表只显示密钥的掩码，不显示完整内容。
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索令牌"
                className="pl-9"
                placeholder="按名称或密钥搜索"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
                没有匹配「<span className="break-all">{query.trim()}</span>」的令牌。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>密钥</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">剩余余额</TableHead>
                      <TableHead>到期</TableHead>
                      <TableHead>最近使用</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((token) => (
                      <TokenRow
                        key={token.id}
                        token={token}
                        deleting={deletingId === token.id}
                        onDelete={() => setPendingDelete(token)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CreateTokenDialog
        open={createOpen}
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
  onDelete,
}: {
  token: TokenItem;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { formatQuota } = useQuotaFormat();
  const status = deriveStatus(token);
  const unlimited = Boolean(token.unlimited_quota);
  const remain = token.remain_quota ?? 0;
  const used = token.used_quota ?? 0;
  const total = remain + used;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <TableRow>
      <TableCell className="max-w-[12rem] font-medium">
        <span className="block truncate" title={token.name}>
          {token.name}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <code className="whitespace-nowrap rounded bg-muted px-2 py-1 font-mono text-xs">
            {token.key ?? "sk-••••"}
          </code>
          {token.key && (
            <CopyButton
              value={token.key}
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {unlimited ? (
          <span className="inline-flex items-center justify-end gap-1 text-sm text-muted-foreground">
            <InfinityIcon className="h-3.5 w-3.5" />
            不限
          </span>
        ) : (
          <div className="ml-auto w-28 space-y-1">
            <div className="flex justify-end gap-1 font-mono text-xs tabular-nums">
              <span className="text-foreground">{formatQuota(used)}</span>
              <span className="text-muted-subtle">/</span>
              <span className="text-muted-foreground">{formatQuota(total)}</span>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={usedPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color]",
                  usedPct >= 100 ? "bg-error" : usedPct >= 80 ? "bg-warning" : "bg-primary",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {isNeverExpire(token.expired_time)
          ? "永不过期"
          : formatDateTime(token.expired_time)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDateTime(token.accessed_time)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label={`删除令牌 ${token.name}`}
            className="text-muted-foreground hover:bg-error-soft hover:text-error"
            disabled={deleting}
            size="icon"
            variant="ghost"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [remainQuota, setRemainQuota] = useState("");
  const [neverExpire, setNeverExpire] = useState(true);
  const [expiredAt, setExpiredAt] = useState("");

  function reset() {
    setName("");
    setRemainQuota("");
    setNeverExpire(true);
    setExpiredAt("");
  }

  function handleOpenChange(next: boolean) {
    if (!next && !creating) {
      reset();
    }
    onOpenChange(next);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);

    try {
      const body: {
        name: string;
        remain_quota_cny?: number;
        expired_time?: number;
      } = {
        name: name.trim(),
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建令牌</DialogTitle>
          <DialogDescription>
            不设置余额上限或过期时间时，将继承上游的默认配置。
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" id="create-token-form" onSubmit={handleCreate}>
          <div className="space-y-2">
            <Label htmlFor="tokenName">名称</Label>
            <Input
              id="tokenName"
              maxLength={64}
              placeholder="例如：生产环境"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remainQuota">余额上限（元）</Label>
            <Input
              id="remainQuota"
              inputMode="decimal"
              min={0}
              placeholder="例如 100，留空则继承默认"
              type="number"
              value={remainQuota}
              onChange={(event) => setRemainQuota(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              留空表示继承上游默认余额上限。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiredAt">过期时间</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={neverExpire}
                onClick={() => setNeverExpire((value) => !value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  neverExpire
                    ? "border-primary/30 bg-primary-soft text-primary"
                    : "border-input bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <InfinityIcon className="h-3.5 w-3.5" />
                Never / 永不过期
              </button>
              <Input
                id="expiredAt"
                className="h-9 flex-1"
                disabled={neverExpire}
                type="datetime-local"
                value={expiredAt}
                onChange={(event) => setExpiredAt(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {neverExpire ? "令牌将永不过期。" : "请选择令牌的到期时间。"}
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={creating}
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button type="submit" form="create-token-form" disabled={creating} className="shrink-0">
            <Plus className="h-4 w-4" />
            {creating ? "创建中…" : "创建"}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除令牌</DialogTitle>
          <DialogDescription>
            确定要删除令牌
            {token ? (
              <span className="font-medium text-foreground"> 「{token.name}」</span>
            ) : null}
            吗？此操作不可撤销，使用该密钥的应用将立即失效。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "删除中…" : "删除令牌"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenSkeleton() {
  return (
    <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
