import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Use a single-column layout instead of the default two-column field grid. */
  compact?: boolean;
  /** Wrap children in the default responsive field grid. Defaults to true. */
  grid?: boolean;
};

/** Lightweight section shell for multi-group form pages. */
export function FormSection({
  title,
  description,
  children,
  className,
  compact = false,
  grid = true,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        "space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {grid ? (
        <div
          className={cn(
            "grid gap-4",
            compact ? "grid-cols-1" : "sm:grid-cols-2",
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
