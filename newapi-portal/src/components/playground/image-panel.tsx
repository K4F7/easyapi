"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 通过 `/playground/embed/` 同源代理嵌入（`IMAGE_PLAYGROUND_INTERNAL_URL`）。
 * 签发短期签名 session token 写入 iframe `apiKey`（非真实 sk-*）；Portal 服务端再注入真实密钥。
 */

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IMAGE_PLAYGROUND_EMBED_PATH } from "@/lib/playground/image-playground-embed-path";
import { cn } from "@/lib/utils";

export type ImagePanelProps = {
  /** 选中的令牌 ID（仅标识，非密钥）。 */
  tokenId: number | null;
  /** 生图令牌不可用时，回退到对话令牌重试会话签发。 */
  fallbackTokenId?: number | null;
  /** 选中的模型名，拼入 iframe `?model=`。 */
  model: string | null;
  className?: string;
};

type EmbedMode = "proxy" | null;

export function ImagePanel({
  tokenId,
  fallbackTokenId = null,
  model,
  className,
}: ImagePanelProps) {
  const [loaded, setLoaded] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [embedMode, setEmbedMode] = useState<EmbedMode>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/playground/images/embed-config", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }
        const payload = (await response.json()) as {
          ok?: boolean;
          data?: { configured?: boolean; theme?: string };
        };
        return payload.ok === true && payload.data?.configured === true;
      })
      .then((proxyConfigured) => {
        if (controller.signal.aborted) {
          return;
        }

        setEmbedMode(proxyConfigured ? "proxy" : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEmbedMode(null);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoaded(false);
    setSessionError(false);

    if (!embedMode || !tokenId) {
      setIframeSrc(null);
      return () => controller.abort();
    }

    async function createIframeUrl() {
      try {
        const origin = window.location.origin;
        const baseUrl = new URL(`${IMAGE_PLAYGROUND_EMBED_PATH}/`, origin);

        baseUrl.searchParams.set("apiUrl", origin);
        baseUrl.searchParams.set("baseUrl", origin);
        baseUrl.searchParams.set(
          "imageApiUrl",
          `${origin}/api/playground/images/generations`,
        );
        baseUrl.searchParams.set("theme", "light");
        if (model) {
          baseUrl.searchParams.set("model", model);
        }

        const sessionToken = await createImageSessionToken(
          [tokenId, fallbackTokenId],
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        baseUrl.searchParams.set("playgroundSessionToken", sessionToken);
        baseUrl.searchParams.set("apiKey", sessionToken);

        setIframeSrc(baseUrl.toString());
      } catch {
        if (!controller.signal.aborted) {
          setIframeSrc(null);
          setSessionError(true);
        }
      }
    }

    void createIframeUrl();
    return () => controller.abort();
  }, [embedMode, fallbackTokenId, model, tokenId]);

  if (!iframeSrc) {
    const title = sessionError
      ? "生图会话初始化失败"
      : embedMode === null
        ? "生图 Playground 未配置"
        : "生图 Playground 加载中";
    const description = sessionError
      ? "请刷新页面重试，真实密钥不会暴露给 iframe。"
      : embedMode === null
        ? "配置 IMAGE_PLAYGROUND_INTERNAL_URL（同源代理）。"
        : "正在签发生图会话并连接 Playground，真实密钥不会暴露给 iframe。";

    return (
      <Card className={cn("flex min-h-0 flex-col", className)}>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-primary/10 text-accent shadow-sm">
            <ImageIcon className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold">{title}</p>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <CardContent className="relative min-h-0 flex-1 p-0">
        {!loaded ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <Skeleton className="h-full w-full" />
          </div>
        ) : null}
        <iframe
          src={iframeSrc}
          title="生图 Playground"
          className="h-full min-h-[320px] w-full border-0"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          allow="clipboard-read; clipboard-write"
        />
      </CardContent>
    </Card>
  );
}

async function createImageSessionToken(
  tokenIds: Array<number | null | undefined>,
  signal: AbortSignal,
): Promise<string> {
  const candidates = [...new Set(tokenIds.filter((id): id is number => typeof id === "number" && id > 0))];

  if (candidates.length === 0) {
    throw new Error("缺少有效的操练场令牌");
  }

  let lastError: string | null = null;

  for (const tokenId of candidates) {
    const response = await fetch("/api/playground/images/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ tokenId, embedTarget: "proxy" }),
      signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: { token?: unknown };
      error?: { message?: string };
    } | null;
    const token = payload?.data?.token;

    if (response.ok && payload?.ok === true && typeof token === "string") {
      return token;
    }

    lastError = payload?.error?.message ?? "生图会话签发失败";
  }

  throw new Error(lastError ?? "生图会话签发失败");
}
