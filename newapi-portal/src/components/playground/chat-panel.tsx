"use client";

/**
 * ChatPanel —— Playground「在线对话」面板（流式实现）。
 *
 * 契约（保持不变）：
 * - 文件路径：`src/components/playground/chat-panel.tsx`
 * - 导出：`export function ChatPanel`
 * - Props：`{ tokenId: number | null; model: string | null }`
 *
 * 安全约束：前端只持有 `tokenId`（number），向 `/api/playground/chat` 仅发送
 * `{ tokenId, model, messages }`，绝不拼接 / 持有真实密钥。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  ChevronDown,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";

import { MarkdownMessage } from "@/components/playground/markdown-message";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/client/api";
import { parseSSE, type SSEUsage } from "@/lib/playground/sse";
import { cn } from "@/lib/utils";

export type ChatPanelProps = {
  /** 选中的令牌 ID（仅标识，非密钥）。可能为 null（用户尚无令牌）。 */
  tokenId: number | null;
  /** 选中的模型名。可能为 null（由本面板模型下拉自管）。 */
  model: string | null;
  className?: string;
};

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  usage?: SSEUsage;
};

type ModelsResponse = {
  models: { id: string }[];
  fallback: boolean;
};

type ModelLoadState = "idle" | "loading" | "ready" | "empty" | "error";

const PROMPT_SUGGESTIONS = [
  "解释一下 RESTful API 设计原则",
  "帮我写一个 Express 错误处理中间件",
  "用 TypeScript 实现一个带超时的 fetch 封装",
  "对比 JWT 与 Session 鉴权的优缺点",
];

const QUICK_PILLS = [
  { label: "写代码", text: "帮我写一段代码：" },
  { label: "总结文本", text: "帮我总结下面这段文本：\n" },
  { label: "分析数据", text: "帮我分析这组数据：\n" },
  { label: "给建议", text: "针对以下问题给我一些建议：" },
  { label: "给我惊喜", text: "给我讲一个关于编程的冷知识。" },
];

export function ChatPanel({ tokenId, model, className }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [modelLoadState, setModelLoadState] = useState<ModelLoadState>("idle");
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(model);
  const [pillsExpanded, setPillsExpanded] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [retryPayload, setRetryPayload] = useState<ChatMessage[] | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isEmpty = messages.length === 0;

  // 拉取模型列表（依赖 tokenId/model），并按新列表校正当前模型。
  useEffect(() => {
    if (tokenId === null) {
      setModels([]);
      setActiveModel(null);
      setModelLoadState("idle");
      setModelLoadError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setModelLoadState("loading");
      setModelLoadError(null);
      try {
        const data = await apiFetch<ModelsResponse>(
          `/api/playground/models?tokenId=${tokenId}`,
        );
        if (cancelled) return;
        setModels(data.models);
        setModelLoadState(data.models.length > 0 ? "ready" : "empty");
        setActiveModel((prev) => {
          const hasModel = (id: string | null) =>
            id !== null && data.models.some((item) => item.id === id);
          if (hasModel(model)) return model;
          if (hasModel(prev)) return prev;
          return data.models[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!cancelled) {
          setModels([]);
          setActiveModel(null);
          setModelLoadState("error");
          setModelLoadError(
            loadError instanceof Error ? loadError.message : "模型加载失败",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId, model]);

  // 组件卸载时终止仍在进行的流式请求。
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 新消息时滚到底部。
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const autoGrow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  function handleInput(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    autoGrow(event.target);
  }

  const runCompletion = useCallback(
    async (history: ChatMessage[]) => {
      if (tokenId === null || !activeModel) {
        setError(modelStatusMessage(modelLoadState, modelLoadError));
        return;
      }

      setError(null);
      setRetryPayload(null);
      setIsStreaming(true);

      const assistantId = crypto.randomUUID();
      setMessages([
        ...history,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/playground/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({
            tokenId,
            model: activeModel,
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!response.ok || !response.body) {
          const detail = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(detail?.error?.message ?? "对话请求失败");
        }

        const reader = response.body.getReader();
        for await (const chunk of parseSSE(reader)) {
          if (chunk.type === "delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk.content }
                  : m,
              ),
            );
          } else if (chunk.type === "usage") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, usage: chunk.usage } : m,
              ),
            );
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 用户主动停止：保留已生成内容，不报错。
        } else {
          const message = err instanceof Error ? err.message : "对话请求失败";
          setError(message);
          setRetryPayload(history);
          // 移除空的 assistant 占位（无内容时）。
          setMessages((prev) =>
            prev.filter((m) => !(m.id === assistantId && m.content === "")),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [tokenId, activeModel, modelLoadState, modelLoadError],
  );

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const history = [...messages, userMessage];
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void runCompletion(history);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRegenerate() {
    if (isStreaming) return;
    if (retryPayload) {
      void runCompletion(retryPayload);
      return;
    }
    // 去掉最后一条 assistant，用其之前的历史重新生成。
    const lastAssistantIdx = [...messages]
      .reverse()
      .findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx === -1) return;
    const cutIdx = messages.length - 1 - lastAssistantIdx;
    void runCompletion(messages.slice(0, cutIdx));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function fillInput(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        autoGrow(el);
      }
    });
  }

  function clearAll() {
    setMessages([]);
    setError(null);
    setRetryPayload(null);
    setConfirmClearOpen(false);
  }

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border-border/60 bg-background/80 shadow-sm backdrop-blur-sm",
        className ?? "h-[640px]",
      )}
    >
      {!isEmpty ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-background/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium">在线对话</span>
            {activeModel ? (
              <span className="truncate rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {activeModel}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            aria-label="清空对话"
            onClick={() => setConfirmClearOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
          {isEmpty ? (
            <EmptyState onPick={fillInput} />
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isStreaming}
                isLastAssistant={message.id === lastAssistantId}
                onRegenerate={handleRegenerate}
              />
            ))
          )}

          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-error/40 bg-error-soft px-4 py-3 text-sm text-error-foreground">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={isStreaming || (!retryPayload && isEmpty)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部输入区 */}
      <div className="border-t border-border/60 bg-background/60 px-4 py-3">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {/* 快捷 prompt 胶囊行 */}
          <QuickPills
            collapsed={!isEmpty}
            expanded={pillsExpanded}
            onToggle={() => setPillsExpanded((v) => !v)}
            onPick={fillInput}
          />

          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-subtle focus-within:ring-2 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                tokenId === null
                  ? "操练场准备中……"
                  : "随便问……（Enter 发送，Shift+Enter 换行）"
              }
              disabled={tokenId === null}
              className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <ModelDropdown
              models={models}
              activeModel={activeModel}
              modelLoadState={modelLoadState}
              modelLoadError={modelLoadError}
              onSelect={setActiveModel}
            />
            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                aria-label="停止生成"
                onClick={handleStop}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full bg-primary"
                aria-label="发送"
                onClick={handleSend}
                disabled={tokenId === null || !activeModel || !input.trim()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空对话？</DialogTitle>
            <DialogDescription>
              当前对话记录将被清除，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmClearOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={clearAll}>
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-primary/10 text-accent shadow-sm">
        <Terminal className="h-7 w-7" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold">开始一段对话</p>
        <p className="text-sm text-muted-foreground">
          选择下方建议，或直接在输入框提问。
        </p>
      </div>
      <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2 mt-4">
        {PROMPT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-xl border border-border/60 bg-background/80 px-4 py-3.5 text-left text-sm text-muted-foreground shadow-sm transition-[background-color,color,box-shadow,border-color] hover:border-primary/20 hover:bg-primary/5 hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickPills({
  collapsed,
  expanded,
  onToggle,
  onPick,
}: {
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPick: (text: string) => void;
}) {
  if (collapsed && !expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className="h-3.5 w-3.5" />
        快捷指令
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_PILLS.map((pill) => (
        <button
          key={pill.label}
          type="button"
          onClick={() => onPick(pill.text)}
          className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {pill.label}
        </button>
      ))}
      {collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          收起
        </button>
      ) : null}
    </div>
  );
}

function ModelDropdown({
  models,
  activeModel,
  modelLoadState,
  modelLoadError,
  onSelect,
}: {
  models: { id: string }[];
  activeModel: string | null;
  modelLoadState: ModelLoadState;
  modelLoadError: string | null;
  onSelect: (id: string) => void;
}) {
  if (models.length === 0) {
    return (
      <span className="max-w-[180px] shrink-0 truncate px-2 text-xs text-muted-foreground">
        {modelStatusMessage(modelLoadState, modelLoadError)}
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 max-w-[160px] shrink-0 gap-1 text-xs text-muted-foreground"
        >
          <span className="truncate">{activeModel ?? "选择模型"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>选择模型</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => onSelect(m.id)}
            className={cn(
              "font-mono text-xs",
              m.id === activeModel && "text-foreground",
            )}
          >
            {m.id}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function modelStatusMessage(
  modelLoadState: ModelLoadState,
  modelLoadError: string | null,
): string {
  if (modelLoadState === "loading") {
    return "模型加载中";
  }
  if (modelLoadState === "empty") {
    return "没有可用模型";
  }
  if (modelLoadState === "error") {
    return modelLoadError ?? "模型加载失败";
  }
  return "请先选择令牌与模型";
}

function MessageBubble({
  message,
  isStreaming,
  isLastAssistant,
  onRegenerate,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  isLastAssistant: boolean;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  const showTyping =
    !isUser && isLastAssistant && isStreaming && message.content === "";

  return (
    <div
      className={cn(
        "group flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* 头像 */}
      {isUser ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          你
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Terminal className="h-4 w-4" />
        </span>
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[calc(100%-3rem)] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "border border-primary/40 bg-primary/5 text-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {showTyping ? (
            <TypingDots />
          ) : isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MarkdownMessage content={message.content} />
          )}
        </div>

        {/* 消耗回显 */}
        {message.usage?.total_tokens ? (
          <span className="px-1 text-xs text-muted-foreground">
            ≈ {message.usage.total_tokens.toLocaleString()} tokens
          </span>
        ) : null}

        {/* hover 操作行 */}
        {!showTyping && message.content ? (
          <div
            className={cn(
              "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
              isUser ? "flex-row-reverse" : "flex-row",
            )}
          >
            <CopyButton
              value={message.content}
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              silent
            />
            {!isUser && isLastAssistant && !isStreaming ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                aria-label="重新生成"
                onClick={onRegenerate}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
