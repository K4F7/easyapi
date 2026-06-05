"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

export interface RevealOnceDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Open-state change handler (also fires when the user dismisses). */
  onOpenChange: (open: boolean) => void;
  /** The secret value (API key / token) to reveal. Shown in monospace. */
  secret: string;
  /** Dialog title. Defaults to "密钥已创建". */
  title?: string;
  /** Optional supporting description under the title. */
  description?: string;
  /** Warning line. Defaults to "此密钥只显示一次". */
  warning?: string;
  /** Confirm/close button label. Defaults to "我已保存". */
  confirmLabel?: string;
  /** Optional callback when the confirm button is pressed (before close). */
  onConfirm?: () => void;
}

/**
 * Controlled "shown only once" reveal dialog for freshly-created secrets.
 * Displays the secret in monospace with a CopyButton and a prominent warning.
 *
 * @example
 * const [open, setOpen] = React.useState(false);
 * <RevealOnceDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   secret={createdToken}
 *   description="请妥善保管你的 API 令牌。"
 * />
 */
export function RevealOnceDialog({
  open,
  onOpenChange,
  secret,
  title = "密钥已创建",
  description,
  warning = "此密钥只显示一次",
  confirmLabel = "我已保存",
  onConfirm,
}: RevealOnceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5",
            "text-sm font-medium text-warning-foreground",
          )}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{warning}</span>
        </div>

        <div className="flex items-stretch gap-2">
          <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-border bg-muted/40 px-3 py-2.5 font-mono text-sm text-foreground">
            {secret}
          </code>
          <CopyButton
            value={secret}
            size="icon"
            variant="outline"
            className="h-auto shrink-0"
            successMessage="密钥已复制"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onConfirm?.();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
