export type UserAgentSettingsStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type UserAgentSettings = {
  user_id: string;
  create_date: string;
  update_date: string;
  status: UserAgentSettingsStatus;
  legal_first_name: string | null;
  legal_middle_name: string | null;
  legal_last_name: string | null;
  preferred_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  phone_alternate: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  trec_license_number: string | null;
  title: string | null;
};
