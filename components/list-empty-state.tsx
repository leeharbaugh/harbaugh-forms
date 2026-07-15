import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ListEmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Calm empty placeholder for list screens. */
export function ListEmptyState({
  title,
  description,
  action,
  className,
}: ListEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8",
        className,
      )}
      role="status"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
