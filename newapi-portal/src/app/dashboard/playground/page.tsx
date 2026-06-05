"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { MessageSquare, ImageIcon } from "lucide-react";

import { ChatPanel } from "@/components/playground/chat-panel";
import { ImagePanel } from "@/components/playground/image-panel";
import { usePlaygroundToken } from "@/components/playground/use-playground-token";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PlaygroundTab = "chat" | "image";

function isTab(value: string | null): value is PlaygroundTab {
  return value === "chat" || value === "image";
}

const TABS: {
  key: PlaygroundTab;
  label: string;
  icon: typeof MessageSquare;
}[] = [
  { key: "chat", label: "对话", icon: MessageSquare },
  { key: "image", label: "生图", icon: ImageIcon },
];

function PlaygroundContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { chatTokenId, imageTokenId, error, loading } = usePlaygroundToken();

  const tabParam = searchParams.get("tab");
  const activeTab: PlaygroundTab = isTab(tabParam) ? tabParam : "chat";

  function selectTab(tab: PlaygroundTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="-mx-4 flex h-[calc(100dvh-12rem)] flex-col md:-mx-6 md:h-[calc(100dvh-7.5rem)]">
      <div
        role="tablist"
        aria-label="试玩模式"
        className="mb-4 inline-flex h-10 shrink-0 items-center self-center rounded-full border border-border/60 bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur-sm sm:self-start"
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
                "relative z-10 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-primary" : "hover:text-foreground",
              )}
            >
              {active && (
                <motion.div
                  layoutId="playground-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-full border border-primary/20 bg-primary/10 shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <PlaygroundPanelSkeleton />
      ) : error ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-border/60 bg-background/80 px-6 py-10 text-center text-sm text-destructive shadow-sm backdrop-blur-sm">
          {error}
        </div>
      ) : activeTab === "chat" ? (
        <ChatPanel tokenId={chatTokenId} model={null} className="flex-1" />
      ) : (
        <ImagePanel
          tokenId={imageTokenId}
          model={null}
          className="flex-1 min-h-0"
        />
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<PlaygroundPageSkeleton />}>
      <PlaygroundContent />
    </Suspense>
  );
}

function PlaygroundPageSkeleton() {
  return (
    <div className="-mx-4 flex h-[calc(100dvh-12rem)] flex-col md:-mx-6 md:h-[calc(100dvh-7.5rem)]">
      <Skeleton className="h-9 w-40" />
      <PlaygroundPanelSkeleton />
    </div>
  );
}

function PlaygroundPanelSkeleton() {
  return <Skeleton className="min-h-0 flex-1 rounded-2xl" />;
}
