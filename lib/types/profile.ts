export type ProfileStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type AppRole = "ADMIN" | "USER";

export type OnboardingStatus = "INVITED" | "ACTIVE" | "DISABLED";

export type Profile = {
  id: string;
  create_date: string;
  update_date: string;
  status: ProfileStatus;
  app_role: AppRole;
  onboarding_status: OnboardingStatus;
  invited_at: string | null;
  activated_at: string | null;
  invited_by_user_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  trec_license_number: string | null;
  brokerage_name: string | null;
  notes: string | null;
  primary_organization_id: string | null;
};

export function formatProfileDisplayName(profile: Profile): string {
  const preferred = profile.preferred_name?.trim();
  if (preferred) {
    return preferred;
  }

  const display = profile.display_name?.trim();
  if (display) {
    return display;
  }

  const parts = [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  if (parts) {
    return parts;
  }

  return profile.email?.trim() || "User";
}

export function formatProfileLegalName(profile: Profile): string {
  const parts = [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  return parts || profile.display_name?.trim() || profile.email?.trim() || "User";
}
