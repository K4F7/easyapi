import Image from "next/image";
import { cn } from "@/lib/utils";

type DuckLogoProps = {
  className?: string;
  priority?: boolean;
  size?: number;
};

export function DuckLogo({
  className,
  priority = false,
  size = 32,
}: DuckLogoProps) {
  const sizedByClass = /\b(h-|w-|size-)/.test(className ?? "");
  const src = size <= 64 ? "/duck-64.webp" : "/duck.webp";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={sizedByClass ? undefined : { width: size, height: size }}
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
