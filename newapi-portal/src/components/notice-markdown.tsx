import Link from "next/link";

type NoticeMarkdownProps = {
  content: string;
};

const inlinePattern =
  /(\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;

export function NoticeMarkdown({ content }: NoticeMarkdownProps) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: string, index: number) {
  const trimmed = block.trim();

  if (!trimmed) {
    return null;
  }

  if (/^#{1,6}\s/.test(trimmed)) {
    const level = trimmed.match(/^#+/)?.[0].length ?? 1;
    const text = trimmed.replace(/^#{1,6}\s+/, "");
    const Tag = level <= 2 ? "h3" : "h4";

    return (
      <Tag
        key={`heading-${index}`}
        className={
          level <= 2
            ? "text-base font-semibold text-foreground"
            : "text-sm font-semibold text-foreground"
        }
      >
        {renderInline(text)}
      </Tag>
    );
  }

  if (/^[-*+]\s/.test(trimmed)) {
    const items = trimmed
      .split("\n")
      .map((line) => line.replace(/^[-*+]\s+/, "").trim())
      .filter(Boolean);

    return (
      <ul key={`list-${index}`} className="list-disc space-y-1 pl-5">
        {items.map((item, itemIndex) => (
          <li key={`list-item-${index}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }

  return (
    <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
      {renderInline(trimmed.replace(/\n/g, " "))}
    </p>
  );
}

function renderInline(text: string) {
  const parts = text.split(inlinePattern).filter(Boolean);

  return parts.map((part, index) => {
    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={`strong-${index}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={`em-${index}`}>{part.slice(1, -1)}</em>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`code-${index}`}
          className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (linkMatch) {
      const [, label, href] = linkMatch;
      const isExternal = /^https?:\/\//i.test(href);

      if (isExternal) {
        return (
          <a
            key={`link-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {label}
          </a>
        );
      }

      return (
        <Link
          key={`link-${index}`}
          href={href}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {label}
        </Link>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}
