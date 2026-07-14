export type OrganizationStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type OrganizationType = "BROKERAGE" | "OTHER";

export type Organization = {
  id: string;
  create_date: string;
  update_date: string;
  status: OrganizationStatus;
  name: string;
  legal_name: string | null;
  organization_type: OrganizationType;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  brokerage_license_number: string | null;
  broker_first_name: string | null;
  broker_middle_name: string | null;
  broker_last_name: string | null;
  broker_license_number: string | null;
  broker_phone: string | null;
  broker_email: string | null;
};

export type MembershipRole = "MEMBER" | "ORG_ADMIN";

export type OrganizationMemberStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type OrganizationMember = {
  id: string;
  create_date: string;
  update_date: string;
  status: OrganizationMemberStatus;
  organization_id: string;
  user_id: string;
  membership_role: MembershipRole;
};
