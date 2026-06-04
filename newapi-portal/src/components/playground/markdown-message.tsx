"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

const components: Components = {
  pre({ children }) {
    const code = extractText(children);
    return (
      <div className="group/code relative my-3">
        <pre className="overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 font-mono text-[13px] leading-relaxed">
          {children}
        </pre>
        <CopyButton
          value={code}
          size="icon"
          variant="outline"
          className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover/code:opacity-100"
          silent
        />
      </div>
    );
  },
  code({ className, children, ...props }) {
    // 行内代码（块级代码由上面的 pre 包裹）。
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={cn("font-mono", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    );
  },
  a({ children, ...props }) {
    return (
      <a
        className="font-medium text-primary underline underline-offset-2"
        target="_blank"
        rel="noreferrer noopener"
        {...props}
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>;
  },
  p({ children }) {
    return <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-4 text-lg font-semibold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-4 text-base font-semibold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-3 text-sm font-semibold">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-border px-3 py-1.5">{children}</td>;
  },
};

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (
    node &&
    typeof node === "object" &&
    "props" in node &&
    (node as { props?: { children?: React.ReactNode } }).props
  ) {
    return extractText(
      (node as { props: { children?: React.ReactNode } }).props.children,
    );
  }
  return "";
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  className,
}: MarkdownMessageProps) {
  return (
    <div className={cn("text-sm text-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
