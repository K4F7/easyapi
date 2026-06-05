import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

export function BrandMark({
  className,
  compact = false,
  priority = false,
}: BrandMarkProps) {
  const size = compact ? 40 : 64;
  const src = size <= 64 ? "/duck-64.webp" : "/duck.webp";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        priority={priority}
      />
    </div>
  );
}
