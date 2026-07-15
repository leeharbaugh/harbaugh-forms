import { cn } from "@/lib/utils";
import Link from "next/link";
import { navLinkClass } from "@/lib/ui/nav-styles";

type AdminSectionNavProps = {
  active: "users" | "organizations";
  className?: string;
};

export function AdminSectionNav({ active, className }: AdminSectionNavProps) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border pb-3",
        className,
      )}
      aria-label="Admin sections"
    >
      <Link
        href="/admin/users"
        className={navLinkClass(active === "users")}
        aria-current={active === "users" ? "page" : undefined}
      >
        Users / Agents
      </Link>
      <Link
        href="/admin/organizations"
        className={navLinkClass(active === "organizations")}
        aria-current={active === "organizations" ? "page" : undefined}
      >
        Organizations
      </Link>
    </nav>
  );
}
