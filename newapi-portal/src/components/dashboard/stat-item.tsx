type StatItemProps = {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
};

export function StatItem({ label, value, loading }: StatItemProps) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
        {loading ? (
          <span
            aria-hidden="true"
            className="inline-block h-7 w-20 animate-pulse rounded-md bg-muted align-middle"
          />
        ) : (
          value
        )}
      </div>
    </div>
  );
}
