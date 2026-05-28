import { cn } from "@/lib/utils";

type DuckLogoProps = {
  className?: string;
};

export function DuckLogo({ className }: DuckLogoProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-8 w-8 rounded-full border border-border bg-card shadow-subtle",
        className,
      )}
    >
      <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-foreground" />
      <span className="absolute -right-1 top-3 h-2.5 w-4 rounded-full bg-primary" />
      <span className="absolute bottom-0 left-2 h-1 w-4 rounded-full bg-primary" />
    </div>
  );
}
