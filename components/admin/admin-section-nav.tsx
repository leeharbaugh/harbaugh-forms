import { cn } from "@/lib/utils";
import Link from "next/link";
import { navLinkClass } from "@/lib/ui/nav-styles";

type AdminSectionNavProps = {
  active: "users" | "organizations" | "brokerages" | "audit";
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
      <Link
        href="/admin/brokerages"
        className={navLinkClass(active === "brokerages")}
        aria-current={active === "brokerages" ? "page" : undefined}
      >
        Brokerages / Offices
      </Link>
      <Link
        href="/admin/audit"
        className={navLinkClass(active === "audit")}
        aria-current={active === "audit" ? "page" : undefined}
      >
        Audit Log
      </Link>
    </nav>
  );
}
