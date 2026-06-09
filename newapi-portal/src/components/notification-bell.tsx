"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

import { NoticeMarkdown } from "@/components/notice-markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const READ_NOTICE_HASH_KEY = "dashboard-notice-read-hash";

type NotificationsPayload = {
  content: string;
  contentHash: string | null;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NotificationsPayload | null>(null);
  const [readHash, setReadHash] = useState<string | null>(null);

  useEffect(() => {
    setReadHash(localStorage.getItem(READ_NOTICE_HASH_KEY));
  }, []);

  const loadNotice = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<NotificationsPayload>("/api/notifications");
      setNotice(data);
    } catch (loadError) {
      setNotice(null);
      setError(
        loadError instanceof Error ? loadError.message : "通知加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const hasUnread =
    Boolean(notice?.contentHash) && notice?.contentHash !== readHash;

  useEffect(() => {
    if (open && notice?.contentHash) {
      localStorage.setItem(READ_NOTICE_HASH_KEY, notice.contentHash);
      setReadHash(notice.contentHash);
    }
  }, [open, notice?.contentHash]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      void loadNotice();
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="通知"
          className="relative rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {hasUnread ? (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "w-[min(22rem,calc(100vw-2rem))] rounded-xl p-0",
          "max-h-[min(24rem,calc(100vh-6rem))] overflow-hidden",
        )}
      >
        <DropdownMenuLabel className="px-4 py-3 text-sm font-semibold">
          系统公告
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[min(20rem,calc(100vh-10rem))] overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在同步 NewAPI 公告…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : notice?.content ? (
            <NoticeMarkdown content={notice.content} />
          ) : (
            <p className="text-sm text-muted-foreground">暂无公告</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
