import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ListRowActionsProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
};

/** Horizontal action buttons for list/table rows — single row, no wrap. */
export function ListRowActions({
  children,
  className,
  align = "end",
}: ListRowActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-row flex-nowrap items-center gap-2 [&>*]:shrink-0",
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
  "min-w-0 whitespace-nowrap px-4 py-3 text-right";

export const listTableActionsCellClass =
  "min-w-0 max-w-0 whitespace-nowrap px-4 py-3 align-middle text-right";
