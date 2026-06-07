"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 通过 `/playground/embed/` 同源代理嵌入（`IMAGE_PLAYGROUND_INTERNAL_URL`）。
 * iframe URL 不携带 session token，依赖 Portal httpOnly session + tokenId。
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
  /** 选中的模型名，拼入 iframe `?model=`。 */
  model: string | null;
  className?: string;
};

type EmbedMode = "proxy" | null;

export function ImagePanel({ tokenId, model, className }: ImagePanelProps) {
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

    const selectedTokenId = tokenId;

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
        baseUrl.searchParams.set("tokenId", String(selectedTokenId));
        baseUrl.searchParams.set("portalTokenId", String(selectedTokenId));
        baseUrl.searchParams.set("theme", "light");
        if (model) {
          baseUrl.searchParams.set("model", model);
        }

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
  }, [embedMode, model, tokenId]);

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
        : "正在通过 Portal 同源代理连接生图 Playground，会话 token 不会写入 URL。";

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
