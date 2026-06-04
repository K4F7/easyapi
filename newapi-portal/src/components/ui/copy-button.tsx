"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "value"> {
  /** The text to copy to the clipboard. */
  value: string;
  /** Optional visible label. When omitted the button is icon-only. */
  label?: string;
  /** Label shown in the "copied" state (only when `label` is set). Defaults to "已复制". */
  copiedLabel?: string;
  /** Toast message on success. Defaults to "已复制". */
  successMessage?: string;
  /** Suppress the sonner toast. Defaults to false (toast shown). */
  silent?: boolean;
}

/**
 * Icon (or icon + label) button that copies `value` to the clipboard and
 * flips to a check / "已复制" state for ~2s. Built on the shared `useCopy` hook.
 *
 * @example
 * <CopyButton value={apiKey} />                 // icon-only, default ghost+icon size
 * <CopyButton value={inviteUrl} label="复制链接" variant="outline" size="sm" />
 */
const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      label,
      copiedLabel = "已复制",
      successMessage = "已复制",
      silent = false,
      variant = "ghost",
      size,
      className,
      ...props
    },
    ref,
  ) => {
    const { copied, copy } = useCopy({ successMessage, showToast: !silent });
    const Icon = copied ? Check : Copy;

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size ?? (label ? "sm" : "icon")}
        onClick={() => copy(value)}
        aria-label={label ? undefined : copied ? copiedLabel : "复制"}
        className={cn(label ? "font-sans" : "", className)}
        {...props}
      >
        <Icon className={cn("h-4 w-4", copied && "text-success")} />
        {label ? <span>{copied ? copiedLabel : label}</span> : null}
      </Button>
    );
  },
);
CopyButton.displayName = "CopyButton";

export { CopyButton };
