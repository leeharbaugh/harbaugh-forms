import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ListRowActionsProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  /** Allow wrapping for dense admin action stacks; tables stay nowrap by default. */
  wrap?: boolean;
};

/** Horizontal action buttons for list/table rows. */
export function ListRowActions({
  children,
  className,
  align = "end",
  wrap = false,
}: ListRowActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-1.5 [&>*]:shrink-0",
        wrap ? "flex-wrap" : "flex-nowrap",
        align === "end" && "justify-end",
        align === "start" && "justify-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const listTableActionsHeaderClass =
  "min-w-0 whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-muted-foreground";

/** Contain nowrap action controls so they cannot paint over adjacent columns. */
export const listTableActionsCellClass =
  "min-w-0 max-w-0 overflow-hidden whitespace-nowrap px-3 py-2.5 align-middle text-right";
