import { AlertCircle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: StateProps) {
  return (
    <Card>
      <CardContent className="flex min-h-40 flex-col items-center justify-center px-4 py-10 text-center">
        <Inbox className="h-8 w-8 text-muted-subtle" />
        <div className="mt-3 text-sm font-medium">{title}</div>
        {description ? (
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {actionLabel && onAction ? (
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction,
}: StateProps) {
  return (
    <Card>
      <CardContent className="flex min-h-40 flex-col items-center justify-center px-4 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <div className="mt-3 text-sm font-medium">{title}</div>
        {description ? (
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {actionLabel && onAction ? (
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
