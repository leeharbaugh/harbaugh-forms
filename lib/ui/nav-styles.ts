/** Shared active/inactive styles for AppNav and section subnav pills. */
export function navLinkClass(active: boolean, className?: string) {
  const classes = [
    "inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "bg-secondary font-medium text-foreground"
      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
    className,
  ];

  return classes.filter(Boolean).join(" ");
}
