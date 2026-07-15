import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function libraryScopeLabel(scope: string | null | undefined): string {
  if (scope === "GLOBAL") {
    return "Global";
  }
  if (scope === "PRIVATE") {
    return "Private";
  }
  return scope?.trim() || "—";
}

export function libraryScopeVariant(
  scope: string | null | undefined,
): BadgeVariant {
  if (scope === "GLOBAL") {
    return "outline";
  }
  if (scope === "PRIVATE") {
    return "secondary";
  }
  return "outline";
}

export function recordStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "DELETED":
      return "Deleted";
    default:
      return status?.trim() || "—";
  }
}

export function recordStatusVariant(
  status: string | null | undefined,
): BadgeVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "warning";
    case "DELETED":
      return "destructive";
    default:
      return "outline";
  }
}

export function appRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "USER":
      return "User";
    default:
      return role?.trim() || "—";
  }
}

export function appRoleVariant(role: string | null | undefined): BadgeVariant {
  if (role === "ADMIN") {
    return "info";
  }
  return "secondary";
}

export function membershipRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "ORG_ADMIN":
      return "Org Admin";
    case "MEMBER":
      return "Member";
    default:
      return role?.trim() || "—";
  }
}

export function onboardingStatusLabel(
  status: string | null | undefined,
): string {
  switch (status) {
    case "INVITED":
      return "Invited";
    case "ACTIVE":
      return "Active";
    case "DISABLED":
      return "Disabled";
    default:
      return status?.trim() || "—";
  }
}
