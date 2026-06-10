"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";

type CopyButtonProps = Omit<ButtonProps, "children" | "onClick"> & {
  value?: string;
  getValue?: () => Promise<string>;
  label?: string;
  copiedLabel?: string;
  silent?: boolean;
};

export function CopyButton({
  value,
  getValue,
  label = "复制",
  copiedLabel = "已复制",
  silent = false,
  disabled,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function handleCopy() {
    setCopying(true);

    try {
      const text = getValue ? await getValue() : value;

      if (!text) {
        throw new Error("Nothing to copy");
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (!silent) {
        toast.success(copiedLabel);
      }
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("复制失败，请手动复制");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Button
      type="button"
      aria-label={copied ? copiedLabel : label}
      disabled={disabled || copying || (!value && !getValue)}
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
