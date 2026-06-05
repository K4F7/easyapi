import { cn } from "@/lib/utils";

export function MarkdownMessage({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <p className={cn("whitespace-pre-wrap break-words leading-6", className)}>
      {content}
    </p>
  );
}
