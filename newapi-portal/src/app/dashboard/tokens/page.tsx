"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
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
import { apiDelete, apiFetch, apiPost } from "@/lib/client/api";
import { formatDateTime, formatQuota, statusText } from "@/lib/client/format";

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

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [remainQuota, setRemainQuota] = useState("");
  const [expiredAt, setExpiredAt] = useState("");

  async function loadTokens() {
    setError(null);
    setLoading(true);

    try {
      const page = await apiFetch<TokenPage>("/api/tokens?p=1&size=50");
      setTokens(page.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "令牌加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreatedKey(null);

    try {
      const body: {
        name: string;
        remain_quota?: number;
        expired_time?: number;
      } = {
        name: name.trim(),
      };

      if (remainQuota.trim()) {
        body.remain_quota = Number(remainQuota);
      }

      if (expiredAt) {
        body.expired_time = Math.floor(new Date(expiredAt).getTime() / 1000);
      }

      const result = await apiPost<CreateTokenResponse>("/api/tokens", body);
      setCreatedKey(result.key);
      setName("");
      setRemainQuota("");
      setExpiredAt("");
      toast.success("令牌已创建");
      await loadTokens();
    } catch (createError) {
      toast.error(
        createError instanceof Error ? createError.message : "令牌创建失败",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(token: TokenItem) {
    setDeletingId(token.id);

    try {
      await apiDelete(`/api/tokens/${encodeURIComponent(String(token.id))}`);
      toast.success("令牌已删除");
      await loadTokens();
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error ? deleteError.message : "令牌删除失败",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function copyCreatedKey() {
    if (!createdKey) {
      return;
    }

    await navigator.clipboard.writeText(createdKey);
    toast.success("Key 已复制");
  }

  useEffect(() => {
    void loadTokens();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">令牌</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创建你的 API 访问令牌。密钥只在创建成功时显示一次，记得及时复制。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>创建令牌</CardTitle>
          <CardDescription>不设置额度或过期时间时使用上游默认配置。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_220px_auto]" onSubmit={handleCreate}>
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
              <Label htmlFor="remainQuota">额度</Label>
              <Input
                id="remainQuota"
                inputMode="numeric"
                min={0}
                placeholder="可选"
                type="number"
                value={remainQuota}
                onChange={(event) => setRemainQuota(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiredAt">过期时间</Label>
              <Input
                id="expiredAt"
                type="datetime-local"
                value={expiredAt}
                onChange={(event) => setExpiredAt(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={creating} type="submit">
                <Plus className="h-4 w-4" />
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>
          </form>

          {createdKey ? (
            <div className="mt-4 rounded-md border border-warning/40 bg-primary-soft/50 p-4">
              <div className="text-sm font-medium">请立即保存明文 key</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-card px-3 py-2 text-sm">
                  {createdKey}
                </code>
                <Button variant="outline" size="sm" onClick={copyCreatedKey}>
                  <Copy className="h-4 w-4" />
                  复制
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
          description="创建一个就能在这里看到它的状态和剩余额度了。"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>令牌列表</CardTitle>
            <CardDescription>为了安全，这里只显示密钥的一部分，不显示完整内容。</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>额度</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最后访问</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-xs">
                        {token.key ?? "masked"}
                      </code>
                    </TableCell>
                    <TableCell>
                      {token.unlimited_quota
                        ? "不限"
                        : formatQuota(token.remain_quota)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={token.status === 1 ? "secondary" : "outline"}>
                        {statusText(token.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(token.accessed_time)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        aria-label={`删除 ${token.name}`}
                        disabled={deletingId === token.id}
                        size="icon"
                        variant="ghost"
                        onClick={() => void handleDelete(token)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TokenSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
