import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { VisibilityScope } from "@/lib/types/form";

export const LIBRARY_PERMISSION_DENIED =
  "You do not have permission to modify this form.";

export const COLLECTION_PERMISSION_DENIED =
  "You do not have permission to modify this collection.";

export type LibraryActor = {
  userId: string;
  isActiveAdmin: boolean;
  /** Organizations where the user has any ACTIVE membership. */
  memberOrganizationIds?: readonly string[];
  /** Organizations where the user is an ACTIVE ORG_ADMIN. */
  orgAdminOrganizationIds?: readonly string[];
};

export type LibraryEntityRef = {
  scope: VisibilityScope | string | null | undefined;
  owner_user_id?: string | null;
  organization_id?: string | null;
  status?: string | null;
};

function isMemberOf(
  actor: LibraryActor,
  organizationId: string | null | undefined,
): boolean {
  if (!organizationId) {
    return false;
  }
  return (actor.memberOrganizationIds ?? []).includes(organizationId);
}

function isOrgAdminOf(
  actor: LibraryActor,
  organizationId: string | null | undefined,
): boolean {
  if (!organizationId) {
    return false;
  }
  return (actor.orgAdminOrganizationIds ?? []).includes(organizationId);
}

export function isActiveAppAdmin(profile: {
  status?: ProfileStatus | string | null;
  app_role?: AppRole | string | null;
  onboarding_status?: OnboardingStatus | string | null;
} | null | undefined): boolean {
  return (
    profile?.status === "ACTIVE" &&
    profile?.app_role === "ADMIN" &&
    profile?.onboarding_status === "ACTIVE"
  );
}

export function canViewForm(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !form) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  if (form.scope === "GLOBAL" && (form.status == null || form.status === "ACTIVE")) {
    return true;
  }
  return form.scope === "PRIVATE" && form.owner_user_id === actor.userId;
}

export function canEditForm(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !form) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return form.scope === "PRIVATE" && form.owner_user_id === actor.userId;
}

export function canMapFormFields(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): boolean {
  return canEditForm(actor, form);
}

export function canDeleteForm(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): boolean {
  return canEditForm(actor, form);
}

export function canViewCollection(
  actor: LibraryActor | null | undefined,
  collection: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !collection) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  if (collection.scope === "ORGANIZATION") {
    return isMemberOf(actor, collection.organization_id);
  }
  // Legacy GLOBAL collections (should not be created going forward).
  if (collection.scope === "GLOBAL") {
    return collection.status == null || collection.status === "ACTIVE";
  }
  return (
    collection.scope === "PRIVATE" && collection.owner_user_id === actor.userId
  );
}

export function canEditCollection(
  actor: LibraryActor | null | undefined,
  collection: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !collection) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  if (collection.scope === "ORGANIZATION") {
    return isOrgAdminOf(actor, collection.organization_id);
  }
  return (
    collection.scope === "PRIVATE" && collection.owner_user_id === actor.userId
  );
}

export function canDeleteCollection(
  actor: LibraryActor | null | undefined,
  collection: LibraryEntityRef | null | undefined,
): boolean {
  return canEditCollection(actor, collection);
}

export function canCloneCollection(
  actor: LibraryActor | null | undefined,
  collection: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !collection) {
    return false;
  }
  if (collection.status != null && collection.status !== "ACTIVE") {
    return false;
  }
  if (
    collection.scope !== "ORGANIZATION" &&
    collection.scope !== "GLOBAL"
  ) {
    return false;
  }
  return canViewCollection(actor, collection);
}

export function canCreateOrganizationCollection(
  actor: LibraryActor | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  if (!actor || !organizationId) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return isOrgAdminOf(actor, organizationId);
}

export function canEditField(
  actor: LibraryActor | null | undefined,
  field: LibraryEntityRef | null | undefined,
): boolean {
  return canEditForm(actor, field);
}

export const FIELD_DEFAULTS_PERMISSION_DENIED =
  "You do not have permission to manage these defaults.";

/** Any authenticated user who can view a Global form may open Manage Defaults. */
export function canOpenManageDefaults(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): boolean {
  if (!actor || !form) {
    return false;
  }
  if (form.scope !== "GLOBAL") {
    return false;
  }
  if (form.status != null && form.status !== "ACTIVE") {
    return false;
  }
  return canViewForm(actor, form);
}

/** Authenticated users always manage only their own Private defaults. */
export function canManageOwnPrivateDefaults(
  actor: LibraryActor | null | undefined,
): boolean {
  return Boolean(actor?.userId);
}

/**
 * View inherited Organization defaults for the primary org when the user has
 * an ACTIVE membership there (or is app admin).
 */
export function canViewInheritedOrganizationDefaults(
  actor: LibraryActor | null | undefined,
  primaryOrganizationId: string | null | undefined,
): boolean {
  if (!actor || !primaryOrganizationId) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return isMemberOf(actor, primaryOrganizationId);
}

/**
 * ORG_ADMIN of the primary organization, or active Global (app) admin.
 * Does not broaden beyond the supplied organization id.
 */
export function canManageOrganizationDefaults(
  actor: LibraryActor | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  if (!actor || !organizationId) {
    return false;
  }
  if (actor.isActiveAdmin) {
    return true;
  }
  return isOrgAdminOf(actor, organizationId);
}

export function nextPrivateCloneCollectionName(
  sourceName: string,
  existingActiveNames: string[],
): string {
  const base = `${sourceName.trim()} - Copy`;
  const existing = new Set(
    existingActiveNames.map((name) => name.trim().toLowerCase()),
  );

  if (!existing.has(base.toLowerCase())) {
    return base;
  }

  let n = 2;
  while (existing.has(`${base} ${n}`.toLowerCase())) {
    n += 1;
  }
  return `${base} ${n}`;
}

export function assertCanEditForm(
  actor: LibraryActor | null | undefined,
  form: LibraryEntityRef | null | undefined,
): void {
  if (!canEditForm(actor, form)) {
    throw new Error(LIBRARY_PERMISSION_DENIED);
  }
}

export function assertCanEditCollection(
  actor: LibraryActor | null | undefined,
  collection: LibraryEntityRef | null | undefined,
): void {
  if (!canEditCollection(actor, collection)) {
    throw new Error(COLLECTION_PERMISSION_DENIED);
  }
}
