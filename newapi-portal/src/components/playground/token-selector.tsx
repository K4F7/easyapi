"use client";

/**
 * Playground 令牌选择器
 *
 * 从 `/api/tokens` 拉取当前用户的令牌列表（列表已由服务端脱敏，`key` 字段
 * 仅为掩码字符串，例如 `sk-abc...wxyz`）。本组件只向上回传选中的 `tokenId`
 * （number）——绝不持有或回传真实密钥。真实密钥由服务端代理注入（Phase B）。
 */

import { useEffect, useState } from "react";
import { ChevronDown, KeyRound, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/**
 * `/api/tokens` 列表项（已脱敏）。字段名与上游一致：
 * - `id`：令牌数字 ID（用于回传）
 * - `name`：用户命名
 * - `key`：脱敏后的掩码 key（仅展示，非真实密钥）
 */
type TokenListItem = {
  id: number;
  name: string;
  key?: string;
};

type TokenPage = {
  items: TokenListItem[];
  total: number;
};

export type TokenSelectorProps = {
  selectedTokenId: number | null;
  onSelect: (tokenId: number | null) => void;
};

export function TokenSelector({ selectedTokenId, onSelect }: TokenSelectorProps) {
  const [tokens, setTokens] = useState<TokenListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const page = await apiFetch<TokenPage>("/api/tokens?p=1&size=100");
        if (cancelled) return;
        setTokens(page.items);
        // 自动选中首个令牌，省去用户多点一步。
        if (page.items.length > 0 && selectedTokenId === null) {
          onSelect(page.items[0].id);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : "令牌列表加载失败",
        );
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // 仅初始加载一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tokens === null && error === null) {
    return <Skeleton className="h-10 w-56" />;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (tokens && tokens.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/dashboard/tokens">
          <Plus className="h-4 w-4" />
          去「令牌」页创建
        </Link>
      </Button>
    );
  }

  const selected = tokens?.find((token) => token.id === selectedTokenId) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-56 justify-between">
          <span className="flex min-w-0 items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? selected.name : "选择令牌"}
            </span>
            {selected?.key ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {selected.key}
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>选择令牌</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tokens?.map((token) => (
          <DropdownMenuItem
            key={token.id}
            onSelect={() => onSelect(token.id)}
            className={cn(
              "flex items-center justify-between gap-3",
              token.id === selectedTokenId && "text-orange-600",
            )}
          >
            <span className="truncate font-medium">{token.name}</span>
            {token.key ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {token.key}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
