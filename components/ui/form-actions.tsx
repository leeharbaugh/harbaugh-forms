import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type FormActionsProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Standard form action row. Put Cancel/secondary first; primary Save/Create last.
 * Children should be ordered Cancel → optional secondary → primary.
 */
export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
