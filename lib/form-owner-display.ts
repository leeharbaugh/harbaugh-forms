import type { ProfileNameFields } from "@/lib/types/profile";

export type FormOwnerProfile = ProfileNameFields & {
  status?: string | null;
  onboarding_status?: string | null;
  email?: string | null;
};

/**
 * Admin-facing ownership label for a private form.
 * Prefer display_name, then preferred+last, then legal name, then email.
 */
export function resolveFormOwnerDisplayName(
  profile: FormOwnerProfile | null | undefined,
  options?: { authEmail?: string | null },
): string {
  if (!profile) {
    const authEmail = options?.authEmail?.trim();
    if (authEmail) {
      return authEmail;
    }
    return "Owner unavailable";
  }

  const inactive =
    profile.status === "INACTIVE" ||
    profile.status === "DELETED" ||
    profile.onboarding_status === "DISABLED";

  const display = profile.display_name?.trim();
  if (display) {
    return inactive ? `${display} (inactive)` : display;
  }

  const preferred = profile.preferred_name?.trim();
  const last = profile.last_name?.trim();
  if (preferred && last) {
    const combined = `${preferred} ${last}`;
    return inactive ? `${combined} (inactive)` : combined;
  }
  if (preferred) {
    return inactive ? `${preferred} (inactive)` : preferred;
  }

  const legal = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (legal) {
    return inactive ? `${legal} (inactive)` : legal;
  }

  const authEmail = options?.authEmail?.trim();
  if (authEmail) {
    return inactive ? `${authEmail} (inactive)` : authEmail;
  }

  const businessEmail = profile.email?.trim();
  if (businessEmail) {
    return inactive ? `${businessEmail} (inactive)` : businessEmail;
  }

  return inactive ? "Owned by inactive user" : "Owner unavailable";
}

export type FormOwnershipPresentation = {
  /** Primary badge / compact label */
  primaryLabel: string;
  /** Optional secondary line for detail views */
  detailLine: string | null;
  /** True when this is another user's private form (admin view) */
  isOtherUserPrivate: boolean;
};

/**
 * How ownership should appear in the Forms list / detail for a given actor.
 */
export function presentFormOwnership(options: {
  scope: string | null | undefined;
  ownerUserId: string | null | undefined;
  viewerUserId: string | null | undefined;
  isActiveAdmin: boolean;
  ownerDisplayName: string | null | undefined;
}): FormOwnershipPresentation {
  const scope = options.scope ?? "PRIVATE";

  if (scope === "GLOBAL") {
    return {
      primaryLabel: "Global",
      detailLine: null,
      isOtherUserPrivate: false,
    };
  }

  if (scope !== "PRIVATE") {
    return {
      primaryLabel: scope === "ORGANIZATION" ? "Organization" : scope,
      detailLine: null,
      isOtherUserPrivate: false,
    };
  }

  const ownerId = options.ownerUserId ?? null;
  const viewerId = options.viewerUserId ?? null;
  const isOwn = Boolean(ownerId && viewerId && ownerId === viewerId);
  const ownerName = options.ownerDisplayName?.trim() || "Owner unavailable";

  if (!options.isActiveAdmin || isOwn || !ownerId) {
    // Standard users, or admin viewing own private form: keep "Private".
    if (!ownerId && options.isActiveAdmin) {
      return {
        primaryLabel: "Private",
        detailLine: "Owner unavailable",
        isOtherUserPrivate: false,
      };
    }
    return {
      primaryLabel: "Private",
      detailLine: null,
      isOtherUserPrivate: false,
    };
  }

  return {
    primaryLabel: `Owned by ${ownerName}`,
    detailLine: `Private form · Owned by ${ownerName}`,
    isOtherUserPrivate: true,
  };
}

export function canOfferCopyToGlobalLibrary(options: {
  isActiveAdmin: boolean;
  scope: string | null | undefined;
  status: string | null | undefined;
  ownerUserId: string | null | undefined;
  sourceStoragePath: string | null | undefined;
}): boolean {
  return (
    options.isActiveAdmin &&
    options.scope === "PRIVATE" &&
    options.status === "ACTIVE" &&
    Boolean(options.ownerUserId?.trim()) &&
    Boolean(options.sourceStoragePath?.trim())
  );
}
