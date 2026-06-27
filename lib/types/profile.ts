export type ProfileStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type Profile = {
  id: string;
  create_date: string;
  update_date: string;
  status: ProfileStatus;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  trec_license_number: string | null;
  brokerage_name: string | null;
  notes: string | null;
};

export function formatProfileDisplayName(profile: Profile): string {
  const parts = [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  if (parts) {
    return parts;
  }

  return profile.email?.trim() || "User";
}
