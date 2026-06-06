"use client";

import { AlertTriangle } from "lucide-react";

import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RevealOnceDialog({
  open,
  onOpenChange,
  secret,
  title,
  description,
  warning,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: string;
  title: string;
  description: string;
  warning: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{warning}</span>
          </div>
          <code className="block max-h-40 overflow-auto rounded-xl border bg-muted px-3 py-2 font-mono text-xs break-all">
            {secret}
          </code>
        </div>
        <DialogFooter>
          <CopyButton value={secret} className="w-full sm:w-auto" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
