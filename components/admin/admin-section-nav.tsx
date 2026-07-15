import { cn } from "@/lib/utils";
import Link from "next/link";

type AdminSectionNavProps = {
  active: "users" | "organizations";
  className?: string;
};

export function AdminSectionNav({ active, className }: AdminSectionNavProps) {
  const linkClass = (section: AdminSectionNavProps["active"]) =>
    section === active
      ? "border-b-2 border-foreground font-medium text-foreground"
      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground";

  return (
    <nav
      className={cn(
        "flex gap-6 border-b border-border text-sm",
        className,
      )}
    >
      <Link
        href="/admin/users"
        className={cn("-mb-px pb-3", linkClass("users"))}
      >
        Users / Agents
      </Link>
      <Link
        href="/admin/organizations"
        className={cn("-mb-px pb-3", linkClass("organizations"))}
      >
        Organizations
      </Link>
    </nav>
  );
}
