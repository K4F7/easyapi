"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  KeyRound,
  Play,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ezapi:onboarding:v1";
const RESTART_EVENT = "ezapi:onboarding:restart";

type OnboardingStatus = "pending" | "skipped" | "completed";

type OnboardingStep = {
  title: string;
  description: string;
  targetLabel: string;
  href: string;
  actionLabel: string;
  icon: LucideIcon;
};

const steps: OnboardingStep[] = [
  {
    title: "复制接入信息",
    description: "先确认 API 地址，后续在 SDK、curl 或你的服务端配置里使用它。",
    targetLabel: "接入信息",
    href: "/dashboard",
    actionLabel: "查看接入信息",
    icon: Check,
  },
  {
    title: "创建 API Token",
    description:
      "进入令牌页创建密钥。渠道档位功能合入后，新建令牌会默认选择一般渠道。",
    targetLabel: "创建 Token",
    href: "/dashboard/tokens",
    actionLabel: "去创建令牌",
    icon: KeyRound,
  },
  {
    title: "打开操练场验证调用",
    description: "用 Chat 或生图操练场跑一次请求，确认余额、Token 和模型接入可用。",
    targetLabel: "Playground",
    href: "/dashboard/playground",
    actionLabel: "打开操练场",
    icon: Play,
  },
];

function readStatus(): OnboardingStatus {
  if (typeof window === "undefined") {
    return "pending";
  }

  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "skipped" || value === "completed" ? value : "pending";
}

function writeStatus(status: OnboardingStatus) {
  window.localStorage.setItem(STORAGE_KEY, status);
}

export function OnboardingTour() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus>("pending");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const firstInteractiveRef = useRef<HTMLButtonElement>(null);

  const isDashboardHome = pathname === "/dashboard";
  const currentStep = steps[stepIndex];
  const progressLabel = `${stepIndex + 1} / ${steps.length}`;

  useEffect(() => {
    const stored = readStatus();
    setStatus(stored);
    setOpen(stored === "pending" && isDashboardHome);
    setHydrated(true);
  }, [isDashboardHome]);

  const restart = useCallback(() => {
    writeStatus("pending");
    setStatus("pending");
    setStepIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(RESTART_EVENT, restart);
    return () => window.removeEventListener(RESTART_EVENT, restart);
  }, [restart]);

  const highlightedTarget = useMemo(() => {
    if (!isDashboardHome || !open) {
      return null;
    }
    if (stepIndex === 0) {
      return "access-info";
    }
    if (stepIndex === 1) {
      return "token-create";
    }
    return "playground-entry";
  }, [isDashboardHome, open, stepIndex]);

  useEffect(() => {
    if (!highlightedTarget) {
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-onboarding-target="${highlightedTarget}"]`,
    );
    if (!element) {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    element.classList.add("onboarding-highlight");
    element.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });

    return () => {
      element.classList.remove("onboarding-highlight");
    };
  }, [highlightedTarget]);

  const skip = useCallback(() => {
    writeStatus("skipped");
    setStatus("skipped");
    setOpen(false);
  }, []);

  const complete = useCallback(() => {
    writeStatus("completed");
    setStatus("completed");
    setOpen(false);
  }, []);

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      complete();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [complete, stepIndex]);

  if (!hydrated) {
    return null;
  }

  return (
    <>
      {status !== "pending" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="onboarding-restart"
          className="fixed bottom-4 right-4 z-40 rounded-xl bg-card/95 shadow-md backdrop-blur"
          onClick={restart}
        >
          <RotateCcw className="h-4 w-4" />
          继续引导
        </Button>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            skip();
            return;
          }
          setOpen(true);
        }}
      >
        <DialogContent
          className="sm:max-w-xl"
          data-testid="onboarding-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            firstInteractiveRef.current?.focus();
          }}
        >
          <DialogHeader>
            <div className="mb-2 flex items-center justify-between gap-3 pr-8">
              <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                新手引导 {progressLabel}
              </div>
              <button
                ref={firstInteractiveRef}
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={skip}
              >
                <X className="h-3.5 w-3.5" />
                跳过
              </button>
            </div>
            <DialogTitle className="text-xl">{currentStep.title}</DialogTitle>
            <DialogDescription className="leading-6">
              {currentStep.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const active = index === stepIndex;
              return (
                <button
                  key={step.title}
                  type="button"
                  className={cn(
                    "flex min-h-24 flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow]",
                    active
                      ? "border-primary/50 bg-primary/10 shadow-sm"
                      : "border-border bg-muted/30 hover:bg-muted",
                  )}
                  onClick={() => setStepIndex(index)}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm font-semibold">
                    {step.targetLabel}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={skip}>
              跳过引导
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={stepIndex === 0}
                data-testid="onboarding-prev"
                onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
              >
                上一步
              </Button>
              <Button type="button" asChild variant="outline">
                <Link href={currentStep.href}>{currentStep.actionLabel}</Link>
              </Button>
              <Button
                type="button"
                data-testid="onboarding-next"
                onClick={goNext}
              >
                {stepIndex === steps.length - 1 ? "完成引导" : "下一步"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
