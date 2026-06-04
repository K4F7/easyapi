"use client";

/**
 * ImagePanel —— Playground「生图」面板。
 *
 * 复用开源 gpt_image_playground（独立部署的 Vite SPA），通过 iframe 嵌入。
 * iframe 基址来自 `NEXT_PUBLIC_IMAGE_PLAYGROUND_URL`，未配置时显示「即将上线」空态。
 *
 * 安全约束：URL 只拼 `apiUrl`（本域同源代理基址）与 `model`，**绝不**带任何密钥。
 * 真实密钥将由服务端代理（同源 `apiUrl` 背后）注入（Phase B）。
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

/** 生图 iframe 基址：独立部署的 gpt_image_playground 地址，留空则显示即将上线。 */
const IMAGE_PLAYGROUND_URL = process.env.NEXT_PUBLIC_IMAGE_PLAYGROUND_URL;

export function ImagePanel({ tokenId, model }: ImagePanelProps) {
  void tokenId;
  const [loaded, setLoaded] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    if (!IMAGE_PLAYGROUND_URL) {
      setIframeSrc(null);
      return;
    }

    const url = new URL(IMAGE_PLAYGROUND_URL, window.location.origin);
    // 指向本域的同源 API 代理（Phase B 实现，密钥服务端注入）。
    url.searchParams.set("apiUrl", window.location.origin);
    if (model) {
      url.searchParams.set("model", model);
    }
    setIframeSrc(url.toString());
  }, [model]);

  if (!iframeSrc) {
    return (
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">生图功能即将上线</p>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              文生图、参考图编辑等能力正在接入，敬请期待。
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
