import type { AppRole, OnboardingStatus, ProfileStatus } from "@/lib/types/profile";
import type { VisibilityScope } from "@/lib/types/form";

export const LIBRARY_PERMISSION_DENIED =
  "You do not have permission to modify this form.";

export const COLLECTION_PERMISSION_DENIED =
  "You do not have permission to modify this collection.";

export type LibraryActor = {
  userId: string;
  isActiveAdmin: boolean;
};

export type LibraryEntityRef = {
  scope: VisibilityScope | string | null | undefined;
  owner_user_id?: string | null;
  status?: string | null;
};

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
  if (collection.scope !== "GLOBAL") {
    return false;
  }
  if (collection.status != null && collection.status !== "ACTIVE") {
    return false;
  }
  return canViewCollection(actor, collection);
}

export function canEditField(
  actor: LibraryActor | null | undefined,
  field: LibraryEntityRef | null | undefined,
): boolean {
  return canEditForm(actor, field);
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
