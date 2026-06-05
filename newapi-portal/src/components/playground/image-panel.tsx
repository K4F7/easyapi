"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 优先通过 `/playground/embed/` 同源代理嵌入（`IMAGE_PLAYGROUND_INTERNAL_URL`）；
 * 否则回退到 `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL` 跨域 iframe（如 https://image.easyapi.work）。
 *
 * 同源代理模式不在 URL 中携带 session token，依赖 Portal httpOnly session + tokenId。
 * 跨域模式签发短期签名 token，并绑定 portal / playground origin。
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

const EXTERNAL_PLAYGROUND_URL =
  process.env.NEXT_PUBLIC_IMAGE_PLAYGROUND_URL?.trim() || null;

type EmbedMode = "proxy" | "external" | null;

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
          data?: { configured?: boolean };
        };
        return payload.ok === true && payload.data?.configured === true;
      })
      .then((proxyConfigured) => {
        if (controller.signal.aborted) {
          return;
        }

        if (proxyConfigured) {
          setEmbedMode("proxy");
          return;
        }

        setEmbedMode(EXTERNAL_PLAYGROUND_URL ? "external" : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEmbedMode(EXTERNAL_PLAYGROUND_URL ? "external" : null);
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
        const baseUrl =
          embedMode === "proxy"
            ? new URL(`${IMAGE_PLAYGROUND_EMBED_PATH}/`, origin)
            : new URL(EXTERNAL_PLAYGROUND_URL!, origin);

        baseUrl.searchParams.set("apiUrl", origin);
        baseUrl.searchParams.set("baseUrl", origin);
        baseUrl.searchParams.set(
          "imageApiUrl",
          `${origin}/api/playground/images/generations`,
        );
        baseUrl.searchParams.set("tokenId", String(selectedTokenId));
        baseUrl.searchParams.set("portalTokenId", String(selectedTokenId));
        if (model) {
          baseUrl.searchParams.set("model", model);
        }

        if (embedMode === "external") {
          const sessionToken = await createImageSessionToken(
            selectedTokenId,
            "external",
            controller.signal,
          );

          if (controller.signal.aborted) {
            return;
          }

          baseUrl.searchParams.set("playgroundSessionToken", sessionToken);
          baseUrl.searchParams.set("apiKey", sessionToken);
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
        ? "配置 IMAGE_PLAYGROUND_INTERNAL_URL（同源代理）或 NEXT_PUBLIC_IMAGE_PLAYGROUND_URL（跨域 iframe，如 https://image.easyapi.work）。"
        : embedMode === "proxy"
          ? "正在通过 Portal 同源代理连接生图 Playground，会话 token 不会写入 URL。"
          : "正在连接生图 Playground，已签发短期签名会话。";

    return (
      <Card className={cn("flex min-h-0 flex-col", className)}>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary shadow-sm">
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
  tokenId: number,
  embedTarget: "proxy" | "external",
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/playground/images/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ tokenId, embedTarget }),
    signal,
  });

  if (!response.ok) {
    throw new Error("Failed to create playground image session");
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    data?: {
      token?: unknown;
    };
  };
  const token = payload.data?.token;

  if (payload.ok !== true || typeof token !== "string") {
    throw new Error("Invalid playground image session response");
  }

  return token;
}
