"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ezapi:onboarding:v1";
const RESTART_EVENT = "ezapi:onboarding:restart";

const POPOVER_WIDTH = 300;
const VIEWPORT_PADDING = 16;
const ANCHOR_GAP = 12;

type OnboardingStatus = "pending" | "skipped" | "completed";

type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end"
  | "right-start"
  | "left-start";

type AnchorPosition = {
  top: number;
  left: number;
  placement: PopoverPlacement;
};

type OnboardingStep = {
  title: string;
  description: string;
  target: "access-copy" | "token-create" | "playground-entry";
  preferredPlacement: PopoverPlacement;
};

const steps: OnboardingStep[] = [
  {
    title: "复制接入信息",
    description: "先确认 API 地址，后续在 SDK、curl 或你的服务端配置里使用它。",
    target: "access-copy",
    preferredPlacement: "bottom-start",
  },
  {
    title: "创建 API Token",
    description:
      "进入令牌页创建密钥。渠道档位功能合入后，新建令牌会默认选择一般渠道。",
    target: "token-create",
    preferredPlacement: "bottom-end",
  },
  {
    title: "打开操练场验证调用",
    description: "用 Chat 或生图操练场跑一次请求，确认余额、Token 和模型接入可用。",
    target: "playground-entry",
    preferredPlacement: "right-start",
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

function getTargetSelector(target: OnboardingStep["target"]) {
  if (target === "playground-entry") {
    return `#dashboard-sidebar [data-onboarding-target="${target}"]`;
  }
  return `[data-onboarding-target="${target}"]`;
}

function getFlipPlacement(placement: PopoverPlacement): PopoverPlacement {
  if (placement.startsWith("bottom")) {
    return placement.replace("bottom", "top") as PopoverPlacement;
  }
  if (placement.startsWith("top")) {
    return placement.replace("top", "bottom") as PopoverPlacement;
  }
  if (placement.startsWith("right")) {
    return placement.replace("right", "left") as PopoverPlacement;
  }
  return placement.replace("left", "right") as PopoverPlacement;
}

function getPlacementCandidates(
  preferred: PopoverPlacement,
): PopoverPlacement[] {
  const flip = getFlipPlacement(preferred);
  if (preferred.startsWith("bottom") || preferred.startsWith("top")) {
    const align = preferred.endsWith("end") ? "end" : "start";
    const oppositeAlign = align === "end" ? "start" : "end";
    const base = preferred.startsWith("bottom") ? "bottom" : "top";
    const flipBase = base === "bottom" ? "top" : "bottom";
    return [
      preferred,
      flip,
      `${base}-${oppositeAlign}` as PopoverPlacement,
      `${flipBase}-${align}` as PopoverPlacement,
      `${flipBase}-${oppositeAlign}` as PopoverPlacement,
      "right-start",
      "left-start",
    ];
  }

  return [preferred, flip, "bottom-start", "bottom-end", "top-start", "top-end"];
}

function computeCoords(
  targetRect: DOMRect,
  popoverSize: { width: number; height: number },
  placement: PopoverPlacement,
): { top: number; left: number } {
  const { width, height } = popoverSize;

  switch (placement) {
    case "bottom-start":
      return {
        top: targetRect.bottom + ANCHOR_GAP,
        left: targetRect.left,
      };
    case "bottom-end":
      return {
        top: targetRect.bottom + ANCHOR_GAP,
        left: targetRect.right - width,
      };
    case "top-start":
      return {
        top: targetRect.top - height - ANCHOR_GAP,
        left: targetRect.left,
      };
    case "top-end":
      return {
        top: targetRect.top - height - ANCHOR_GAP,
        left: targetRect.right - width,
      };
    case "right-start":
      return {
        top: targetRect.top,
        left: targetRect.right + ANCHOR_GAP,
      };
    case "left-start":
      return {
        top: targetRect.top,
        left: targetRect.left - width - ANCHOR_GAP,
      };
  }
}

function fitsViewport(
  coords: { top: number; left: number },
  popoverSize: { width: number; height: number },
) {
  const { top, left, width, height } = {
    top: coords.top,
    left: coords.left,
    ...popoverSize,
  };

  return (
    top >= VIEWPORT_PADDING &&
    left >= VIEWPORT_PADDING &&
    top + height <= window.innerHeight - VIEWPORT_PADDING &&
    left + width <= window.innerWidth - VIEWPORT_PADDING
  );
}

function clampCoords(
  coords: { top: number; left: number },
  popoverSize: { width: number; height: number },
) {
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - popoverSize.width - VIEWPORT_PADDING,
  );
  const maxTop = Math.max(
    VIEWPORT_PADDING,
    window.innerHeight - popoverSize.height - VIEWPORT_PADDING,
  );

  return {
    top: Math.min(Math.max(coords.top, VIEWPORT_PADDING), maxTop),
    left: Math.min(Math.max(coords.left, VIEWPORT_PADDING), maxLeft),
  };
}

function resolveAnchorPosition(
  targetRect: DOMRect,
  popoverSize: { width: number; height: number },
  preferred: PopoverPlacement,
): AnchorPosition {
  const candidates = getPlacementCandidates(preferred);

  for (const placement of candidates) {
    const coords = computeCoords(targetRect, popoverSize, placement);
    if (fitsViewport(coords, popoverSize)) {
      return { ...coords, placement };
    }
  }

  const fallbackCoords = computeCoords(targetRect, popoverSize, preferred);
  const clamped = clampCoords(fallbackCoords, popoverSize);
  return { ...clamped, placement: preferred };
}

function useAnchorPosition(
  selector: string | null,
  preferredPlacement: PopoverPlacement,
  enabled: boolean,
) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchorPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!enabled || !selector) {
      setPosition(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      setPosition(null);
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const measured = popoverRef.current?.getBoundingClientRect();
    const popoverSize = {
      width: measured?.width ?? POPOVER_WIDTH,
      height: measured?.height ?? 180,
    };

    setPosition(resolveAnchorPosition(targetRect, popoverSize, preferredPlacement));
  }, [enabled, preferredPlacement, selector]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    if (!enabled || !selector) {
      return;
    }

    const handleChange = () => updatePosition();

    window.addEventListener("resize", handleChange);
    window.addEventListener("scroll", handleChange, true);

    const target = document.querySelector<HTMLElement>(selector);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleChange)
        : null;

    if (target && resizeObserver) {
      resizeObserver.observe(target);
    }
    if (popoverRef.current && resizeObserver) {
      resizeObserver.observe(popoverRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleChange);
      window.removeEventListener("scroll", handleChange, true);
      resizeObserver?.disconnect();
    };
  }, [enabled, selector, updatePosition]);

  return { popoverRef, position };
}

type OnboardingPopoverProps = {
  open: boolean;
  stepIndex: number;
  currentStep: OnboardingStep;
  progressLabel: string;
  targetSelector: string;
  onSkip: () => void;
  onNext: () => void;
};

function OnboardingPopover({
  open,
  stepIndex,
  currentStep,
  progressLabel,
  targetSelector,
  onSkip,
  onNext,
}: OnboardingPopoverProps) {
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = "onboarding-popover-title";
  const descriptionId = "onboarding-popover-description";
  const { popoverRef, position } = useAnchorPosition(
    targetSelector,
    currentStep.preferredPlacement,
    open,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    nextButtonRef.current?.focus();
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSkip, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const isLastStep = stepIndex >= steps.length - 1;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="onboarding-dialog"
      data-placement={position?.placement ?? currentStep.preferredPlacement}
      className="onboarding-popover fixed z-[70] w-[min(300px,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-subtle"
      style={
        position
          ? { top: position.top, left: position.left }
          : {
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              visibility: "hidden",
            }
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          新手引导 {progressLabel}
        </div>
      </div>

      <h2 id={titleId} className="text-base font-semibold leading-snug">
        {currentStep.title}
      </h2>
      <p
        id={descriptionId}
        className="mt-1 text-sm leading-5 text-muted-foreground"
      >
        {currentStep.description}
      </p>

      <div
        className="mt-3 flex items-center gap-1.5"
        aria-label={`步骤 ${progressLabel}`}
      >
        {steps.map((step, index) => (
          <span
            key={step.target}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              index === stepIndex
                ? "bg-primary"
                : index < stepIndex
                  ? "bg-primary/40"
                  : "bg-muted-foreground/25",
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
          跳过引导
        </Button>
        <Button
          ref={nextButtonRef}
          type="button"
          size="sm"
          data-testid="onboarding-next"
          onClick={onNext}
        >
          {isLastStep ? "完成引导" : "下一步"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>,
    document.body,
  );
}

export function OnboardingTour() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus>("pending");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

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
    return currentStep.target;
  }, [currentStep.target, isDashboardHome, open]);

  const targetSelector = useMemo(() => {
    if (!highlightedTarget) {
      return "";
    }
    return getTargetSelector(highlightedTarget);
  }, [highlightedTarget]);

  useEffect(() => {
    if (!highlightedTarget) {
      return;
    }

    const selector = getTargetSelector(highlightedTarget);
    let highlightedElement: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let pollTimeout: number | null = null;

    const clearHighlight = () => {
      highlightedElement?.classList.remove("onboarding-highlight");
      highlightedElement = null;
    };

    const highlightTarget = () => {
      const element = document.querySelector<HTMLElement>(selector);

      if (!element) {
        return false;
      }

      if (highlightedElement === element) {
        return true;
      }

      clearHighlight();
      highlightedElement = element;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      element.classList.add("onboarding-highlight");
      element.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });

      return true;
    };

    const schedulePoll = () => {
      if (pollTimeout !== null) {
        return;
      }

      pollTimeout = window.setTimeout(() => {
        pollTimeout = null;
        if (!highlightTarget()) {
          schedulePoll();
        }
      }, 100);
    };

    if (!highlightTarget()) {
      observer = new MutationObserver(() => {
        if (highlightTarget()) {
          observer?.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      schedulePoll();
    }

    return () => {
      if (pollTimeout !== null) {
        window.clearTimeout(pollTimeout);
      }
      observer?.disconnect();
      clearHighlight();
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

      <OnboardingPopover
        open={open}
        stepIndex={stepIndex}
        currentStep={currentStep}
        progressLabel={progressLabel}
        targetSelector={targetSelector}
        onSkip={skip}
        onNext={goNext}
      />
    </>
  );
}
