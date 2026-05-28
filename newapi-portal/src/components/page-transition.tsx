import { cn } from "@/lib/utils";

export function PageTransition({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return <div className={cn("page-transition", className)}>{children}</div>;
}
