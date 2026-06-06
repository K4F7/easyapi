"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";

type CopyButtonProps = Omit<ButtonProps, "children" | "onClick"> & {
  value: string;
  label?: string;
  copiedLabel?: string;
  silent?: boolean;
};

export function CopyButton({
  value,
  label = "复制",
  copiedLabel = "已复制",
  silent = false,
  disabled,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (!silent) {
        toast.success(copiedLabel);
      }
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <Button
      type="button"
      aria-label={copied ? copiedLabel : label}
      disabled={disabled || !value}
      onClick={handleCopy}
      {...props}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {props.size === "icon" ? null : (
        <span>{copied ? copiedLabel : label}</span>
      )}
    </Button>
  );
}
