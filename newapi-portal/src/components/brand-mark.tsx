import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative shrink-0 rounded-full border border-border bg-foreground shadow-sm",
        compact ? "size-9" : "size-16",
        className,
      )}
    >
      <div className="absolute left-[22%] top-[23%] h-[45%] w-[56%] rounded-full bg-card" />
      <div className="absolute left-[36%] top-[17%] h-[28%] w-[32%] rounded-full bg-card" />
      <div className="absolute left-[57%] top-[27%] size-[7%] rounded-full bg-foreground" />
      <div className="absolute right-[11%] top-[39%] h-[13%] w-[24%] rounded-full bg-primary" />
      <div className="absolute bottom-[15%] left-[33%] h-[9%] w-[16%] rounded-full bg-primary" />
      <div className="absolute bottom-[15%] right-[27%] h-[9%] w-[16%] rounded-full bg-primary" />
    </div>
  );
}
