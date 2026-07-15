import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ListPageHeaderProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Shared list-page title row: title + optional description + primary action. */
export function ListPageHeader({
  title,
  description,
  action,
  className,
}: ListPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <div className="text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
