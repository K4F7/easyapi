"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, ImageIcon } from "lucide-react";

import { ChatPanel } from "@/components/playground/chat-panel";
import { ImagePanel } from "@/components/playground/image-panel";
import { TokenSelector } from "@/components/playground/token-selector";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PlaygroundTab = "chat" | "image";

function isTab(value: string | null): value is PlaygroundTab {
  return value === "chat" || value === "image";
}

const TABS: { key: PlaygroundTab; label: string; icon: typeof MessageSquare }[] =
  [
    { key: "chat", label: "对话", icon: MessageSquare },
    { key: "image", label: "生图", icon: ImageIcon },
  ];

function PlaygroundContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: PlaygroundTab = isTab(tabParam) ? tabParam : "chat";

  // 选择器只回传 id / model 字符串，绝不持有真实密钥。
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  // 模型选择器由包 B 接入，本批先留空。
  const [selectedModel] = useState<string | null>(null);

  function selectTab(tab: PlaygroundTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    // 仅更新 URL，不整页刷新。
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">操练场</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          不用离开门户，用你自己的令牌直接试玩对话与生图能力。
        </p>
      </div>

      {/* 页面壳：令牌选择器 + 用法提示 */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">试玩令牌</p>
            <p className="text-xs text-muted-foreground">
              选择一个令牌用于试玩，消耗将计入该令牌的用量。
            </p>
          </div>
          <TokenSelector
            selectedTokenId={selectedTokenId}
            onSelect={setSelectedTokenId}
          />
        </CardContent>
      </Card>

      {/* 分段控件：切 对话 / 生图，状态写进 URL ?tab= */}
      <div
        role="tablist"
        aria-label="试玩模式"
        className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground"
      >
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(tab.key)}
              className={cn(
                "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-card text-orange-600 shadow-subtle"
                  : "hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "chat" ? (
        <ChatPanel tokenId={selectedTokenId} model={selectedModel} />
      ) : (
        <ImagePanel tokenId={selectedTokenId} model={selectedModel} />
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<PlaygroundSkeleton />}>
      <PlaygroundContent />
    </Suspense>
  );
}

function PlaygroundSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
