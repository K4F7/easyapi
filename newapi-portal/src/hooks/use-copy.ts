"use client";

import * as React from "react";
import { toast } from "sonner";

export interface UseCopyOptions {
  /** Toast message shown on success. Defaults to "已复制". */
  successMessage?: string;
  /** Toast message shown on failure. Defaults to "复制失败". */
  errorMessage?: string;
  /** How long (ms) the `copied` flag stays true after a successful copy. Defaults to 2000. */
  resetDelay?: number;
  /** Set to false to suppress the sonner toast (e.g. when caller shows its own feedback). Defaults to true. */
  showToast?: boolean;
}

export interface UseCopyReturn {
  /** True for `resetDelay` ms after a successful copy. Drive icon/button state from this. */
  copied: boolean;
  /** Copy `value` to the clipboard. Returns true on success, false on failure. */
  copy: (value: string) => Promise<boolean>;
}

/**
 * Shared clipboard-copy hook: writes to the clipboard, fires a sonner toast,
 * and exposes a `copied` boolean that flips back to false after `resetDelay`.
 *
 * @example
 * const { copied, copy } = useCopy();
 * <button onClick={() => copy(token)}>{copied ? "已复制" : "复制"}</button>
 */
export function useCopy(options: UseCopyOptions = {}): UseCopyReturn {
  const {
    successMessage = "已复制",
    errorMessage = "复制失败",
    resetDelay = 2000,
    showToast = true,
  } = options;

  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = React.useCallback(
    async (value: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (showToast) toast.success(successMessage);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetDelay);
        return true;
      } catch {
        if (showToast) toast.error(errorMessage);
        return false;
      }
    },
    [successMessage, errorMessage, resetDelay, showToast],
  );

  return { copied, copy };
}
