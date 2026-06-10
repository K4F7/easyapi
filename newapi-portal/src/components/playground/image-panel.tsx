"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 通过 `/playground/embed/` 同源代理嵌入（`IMAGE_PLAYGROUND_INTERNAL_URL`）。
 * 将固定 `portal-token-{tokenId}` 标记写入 iframe `apiKey`（非真实 sk-*）；
 * Portal 服务端再注入真实密钥。仅注入一次，不签发短期 session token。
 */

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildPortalTokenMarker,
  IMAGE_PLAYGROUND_EMBED_PATH,
  type ImagePlaygroundEmbedConfig,
} from "@/lib/playground/image-playground-embed-path";
import { cn } from "@/lib/utils";

export type ImagePanelProps = {
  /** 选中的令牌 ID（仅标识，非密钥）。 */
  tokenId: number | null;
  /** 选中的模型名，拼入 iframe `?model=`。 */
  model: string | null;
  className?: string;
};

type EmbedMode = "proxy" | null;

function readParentApiUrlOverride(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const override = new URLSearchParams(window.location.search).get("apiUrl")?.trim();
  return override || null;
}

function buildCanonicalEmbedConfig(input: {
  origin: string;
  apiUrl: string;
  tokenId: number;
  model: string | null;
}): ImagePlaygroundEmbedConfig {
  const config: ImagePlaygroundEmbedConfig = {
    apiUrl: input.apiUrl,
    apiKey: buildPortalTokenMarker(input.tokenId),
    baseUrl: input.origin,
    imageApiUrl: `${input.origin}/api/playground/images/generations`,
    tokenId: String(input.tokenId),
    portalTokenId: String(input.tokenId),
    theme: "light",
  };

  if (input.model) {
    config.model = input.model;
  }

  return config;
}

function buildIframeUrlFromConfig(
  origin: string,
  config: ImagePlaygroundEmbedConfig,
): string {
  const url = new URL(`${IMAGE_PLAYGROUND_EMBED_PATH}/`, origin);

  for (const [key, value] of Object.entries(config)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function getEmbedConfigSignature(
  tokenId: number,
  model: string | null,
  apiUrl: string,
): string {
  return [tokenId, model ?? "", apiUrl].join("|");
}

export function ImagePanel({
  tokenId,
  model,
  className,
}: ImagePanelProps) {
  const [loaded, setLoaded] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [embedMode, setEmbedMode] = useState<EmbedMode>(null);

  const lastInjectedConfigRef = useRef<string | null>(null);

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
    setLoaded(false);

    if (!embedMode || !tokenId) {
      lastInjectedConfigRef.current = null;
      setIframeSrc(null);
      return;
    }

    const origin = window.location.origin;
    const apiUrl = readParentApiUrlOverride() ?? origin;
    const configSignature = getEmbedConfigSignature(tokenId, model, apiUrl);

    if (lastInjectedConfigRef.current === configSignature) {
      setLoaded(true);
      return;
    }

    lastInjectedConfigRef.current = configSignature;
    const embedConfig = buildCanonicalEmbedConfig({
      origin,
      apiUrl,
      tokenId,
      model,
    });
    setIframeSrc(buildIframeUrlFromConfig(origin, embedConfig));
  }, [embedMode, model, tokenId]);

  if (!iframeSrc) {
    const title =
      embedMode === null
        ? "生图 Playground 未配置"
        : "生图 Playground 加载中";

    const description =
      embedMode === null
        ? "配置 IMAGE_PLAYGROUND_INTERNAL_URL（同源代理）。"
        : "正在连接生图 Playground，真实密钥不会暴露给 iframe。";

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
