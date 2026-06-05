"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 复用开源 gpt_image_playground（独立部署的 Vite SPA），通过 iframe 嵌入。
 * iframe 基址来自 `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL`，未配置时显示配置提示。
 *
 * 安全约束：URL 只拼 `tokenId` / 短期 image session token 与本域代理基址，**绝不**带真实密钥。
 * 真实密钥由服务端代理按签名 token 绑定的用户 + token 归属校验后注入。
 */

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type ImagePanelProps = {
  /** 选中的令牌 ID（仅标识，非密钥）。Phase B 由服务端按此注入密钥。 */
  tokenId: number | null;
  /** 选中的模型名，拼入 iframe `?model=`。 */
  model: string | null;
};

/** 生图 iframe 基址：独立部署的 gpt_image_playground 地址，留空则显示配置提示。 */
const IMAGE_PLAYGROUND_URL = process.env.NEXT_PUBLIC_IMAGE_PLAYGROUND_URL;

export function ImagePanel({ tokenId, model }: ImagePanelProps) {
  const [loaded, setLoaded] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setLoaded(false);
    setSessionError(false);
    if (!IMAGE_PLAYGROUND_URL || !tokenId) {
      setIframeSrc(null);
      return () => controller.abort();
    }
    const selectedTokenId = tokenId;

    async function createIframeUrl() {
      try {
        const sessionToken = await createImageSessionToken(
          selectedTokenId,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        const url = new URL(IMAGE_PLAYGROUND_URL!, window.location.origin);
        const origin = window.location.origin;

        // 兼容 OpenAI 风格 iframe：优先让其调用 `${apiUrl}/v1/images/generations`。
        url.searchParams.set("apiUrl", origin);
        url.searchParams.set("baseUrl", origin);
        // 兼容支持直连 endpoint 的实现。
        url.searchParams.set(
          "imageApiUrl",
          `${origin}/api/playground/images/generations`,
        );
        url.searchParams.set("tokenId", String(selectedTokenId));
        url.searchParams.set("portalTokenId", String(selectedTokenId));
        url.searchParams.set("playgroundSessionToken", sessionToken);
        // 兼容只会读取 apiKey 并转成 Authorization Bearer 的实现；这不是 NewAPI 真实 key。
        url.searchParams.set("apiKey", sessionToken);
        if (model) {
          url.searchParams.set("model", model);
        }
        setIframeSrc(url.toString());
      } catch {
        if (!controller.signal.aborted) {
          setIframeSrc(null);
          setSessionError(true);
        }
      }
    }

    void createIframeUrl();
    return () => controller.abort();
  }, [model, tokenId]);

  if (!iframeSrc) {
    const title = sessionError
      ? "生图会话初始化失败"
      : IMAGE_PLAYGROUND_URL
        ? "请选择试玩令牌"
        : "生图 Playground 未配置";
    const description = sessionError
      ? "请刷新页面或重新选择令牌，真实密钥不会暴露给 iframe。"
      : IMAGE_PLAYGROUND_URL
        ? "选择一个令牌后即可打开生图 Playground，真实密钥只会在服务端代理中使用。"
        : "配置 NEXT_PUBLIC_IMAGE_PLAYGROUND_URL 后即可嵌入独立的生图 Playground。";

    return (
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-0">
        {!loaded ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <Skeleton className="h-full w-full" />
          </div>
        ) : null}
        <iframe
          src={iframeSrc}
          title="生图 Playground"
          className="h-[70vh] min-h-[480px] w-full border-0"
          onLoad={() => setLoaded(true)}
          // 允许剪贴板/下载等常用能力；不授予导航顶层窗口。
          allow="clipboard-read; clipboard-write"
        />
      </CardContent>
    </Card>
  );
}

async function createImageSessionToken(
  tokenId: number,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/playground/images/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ tokenId }),
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
