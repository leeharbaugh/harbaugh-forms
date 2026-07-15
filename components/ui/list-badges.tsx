import { Badge } from "@/components/ui/badge";
import {
  appRoleLabel,
  appRoleVariant,
  libraryScopeLabel,
  libraryScopeVariant,
  membershipRoleLabel,
  onboardingStatusLabel,
  recordStatusLabel,
  recordStatusVariant,
} from "@/lib/ui/list-badges";
import { cn } from "@/lib/utils";

type CompactBadgeProps = {
  className?: string;
};

export function LibraryScopeBadge({
  scope,
  organizationName,
  className,
}: CompactBadgeProps & {
  scope: string | null | undefined;
  /** When set for organization collections, shown as the badge label. */
  organizationName?: string | null;
}) {
  if (!scope) {
    return null;
  }

  const label =
    scope === "ORGANIZATION" && organizationName?.trim()
      ? organizationName.trim()
      : libraryScopeLabel(scope);

  return (
    <Badge
      variant={libraryScopeVariant(scope)}
      className={cn("shrink-0 font-medium", className)}
      title={
        scope === "ORGANIZATION"
          ? organizationName
            ? `Organization · ${organizationName}`
            : "Organization"
          : undefined
      }
    >
      {label}
    </Badge>
  );
}

export function RecordStatusBadge({
  status,
  className,
}: CompactBadgeProps & { status: string | null | undefined }) {
  if (!status) {
    return null;
  }
  return (
    <Badge
      variant={recordStatusVariant(status)}
      className={cn("shrink-0 font-medium", className)}
    >
      {recordStatusLabel(status)}
    </Badge>
  );
}

export function AppRoleBadge({
  role,
  className,
}: CompactBadgeProps & { role: string | null | undefined }) {
  if (!role) {
    return null;
  }
  return (
    <Badge
      variant={appRoleVariant(role)}
      className={cn("shrink-0 font-medium", className)}
    >
      {appRoleLabel(role)}
    </Badge>
  );
}

export function MembershipRoleBadge({
  role,
  className,
}: CompactBadgeProps & { role: string | null | undefined }) {
  if (!role) {
    return null;
  }
  return (
    <Badge variant="outline" className={cn("shrink-0 font-medium", className)}>
      {membershipRoleLabel(role)}
    </Badge>
  );
}

export function OnboardingStatusBadge({
  status,
  className,
}: CompactBadgeProps & { status: string | null | undefined }) {
  if (!status) {
    return null;
  }
  return (
    <Badge
      variant={status === "DISABLED" ? "warning" : "outline"}
      className={cn("shrink-0 font-medium", className)}
    >
      {onboardingStatusLabel(status)}
    </Badge>
  );
}
