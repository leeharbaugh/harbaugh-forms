export type ContactType = "INDIVIDUAL" | "ENTITY";

export type Contact = {
  id: number;
  contact_type: ContactType;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  preferred_name: string | null;
  title: string | null;
  entity_name: string | null;
  entity_type: string | null;
  email: string | null;
  email_secondary: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  street_address_line_1: string | null;
  street_address_line_2: string | null;
  street_city: string | null;
  street_state: string | null;
  street_zip: string | null;
  county: string | null;
  preferred_contact_method: string | null;
  company_name: string | null;
  brokerage_name: string | null;
  trec_license_number: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  notes: string | null;
  owner_user_id: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type ContactInput = {
  contact_type: ContactType;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  preferred_name: string | null;
  title: string | null;
  entity_name: string | null;
  entity_type: string | null;
  email: string | null;
  email_secondary: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  street_address_line_1: string | null;
  street_address_line_2: string | null;
  street_city: string | null;
  street_state: string | null;
  street_zip: string | null;
  county: string | null;
  preferred_contact_method: string | null;
  company_name: string | null;
  brokerage_name: string | null;
  trec_license_number: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  notes: string | null;
};

export const emptyContactInput = (): ContactInput => ({
  contact_type: "INDIVIDUAL",
  first_name: null,
  middle_name: null,
  last_name: null,
  suffix: null,
  preferred_name: null,
  title: null,
  entity_name: null,
  entity_type: null,
  email: null,
  email_secondary: null,
  phone_primary: null,
  phone_secondary: null,
  mailing_address_line_1: null,
  mailing_address_line_2: null,
  mailing_city: null,
  mailing_state: "TX",
  mailing_zip: null,
  street_address_line_1: null,
  street_address_line_2: null,
  street_city: null,
  street_state: "TX",
  street_zip: null,
  county: null,
  preferred_contact_method: null,
  company_name: null,
  brokerage_name: null,
  trec_license_number: null,
  date_of_birth: null,
  occupation: null,
  notes: null,
});

export function contactToInput(contact: Contact): ContactInput {
  return {
    contact_type: contact.contact_type,
    first_name: contact.first_name,
    middle_name: contact.middle_name,
    last_name: contact.last_name,
    suffix: contact.suffix,
    preferred_name: contact.preferred_name,
    title: contact.title,
    entity_name: contact.entity_name,
    entity_type: contact.entity_type,
    email: contact.email,
    email_secondary: contact.email_secondary,
    phone_primary: contact.phone_primary,
    phone_secondary: contact.phone_secondary,
    mailing_address_line_1: contact.mailing_address_line_1,
    mailing_address_line_2: contact.mailing_address_line_2,
    mailing_city: contact.mailing_city,
    mailing_state: contact.mailing_state ?? "TX",
    mailing_zip: contact.mailing_zip,
    street_address_line_1: contact.street_address_line_1,
    street_address_line_2: contact.street_address_line_2,
    street_city: contact.street_city,
    street_state: contact.street_state ?? "TX",
    street_zip: contact.street_zip,
    county: contact.county,
    preferred_contact_method: contact.preferred_contact_method,
    company_name: contact.company_name,
    brokerage_name: contact.brokerage_name,
    trec_license_number: contact.trec_license_number,
    date_of_birth: contact.date_of_birth,
    occupation: contact.occupation,
    notes: contact.notes,
  };
}

export function validateContactInput(input: ContactInput): string | null {
  if (input.contact_type === "INDIVIDUAL") {
    if (!input.first_name?.trim()) {
      return "First name is required for individual contacts.";
    }
    if (!input.last_name?.trim()) {
      return "Last name is required for individual contacts.";
    }
  }

  if (input.contact_type === "ENTITY" && !input.entity_name?.trim()) {
    return "Entity name is required for entity contacts.";
  }

  return null;
}

export function formatContactDisplayName(contact: Contact): string {
  if (contact.contact_type === "ENTITY" && contact.entity_name) {
    return contact.entity_name;
  }

  const preferred = contact.preferred_name?.trim();
  if (preferred) {
    return preferred;
  }

  const parts = [contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
    .filter(Boolean)
    .join(" ");

  return parts || "Unnamed contact";
}

export function formatContactDateOfBirth(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}/${day}/${year}`;
  }

  return trimmed;
}

export function normalizeContactInput(input: ContactInput): ContactInput {
  const trim = (value: string | null) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    contact_type: input.contact_type,
    first_name: trim(input.first_name),
    middle_name: trim(input.middle_name),
    last_name: trim(input.last_name),
    suffix: trim(input.suffix),
    preferred_name: trim(input.preferred_name),
    title: trim(input.title),
    entity_name: trim(input.entity_name),
    entity_type: trim(input.entity_type),
    email: trim(input.email),
    email_secondary: trim(input.email_secondary),
    phone_primary: trim(input.phone_primary),
    phone_secondary: trim(input.phone_secondary),
    mailing_address_line_1: trim(input.mailing_address_line_1),
    mailing_address_line_2: trim(input.mailing_address_line_2),
    mailing_city: trim(input.mailing_city),
    mailing_state: trim(input.mailing_state) ?? "TX",
    mailing_zip: trim(input.mailing_zip),
    street_address_line_1: trim(input.street_address_line_1),
    street_address_line_2: trim(input.street_address_line_2),
    street_city: trim(input.street_city),
    street_state: trim(input.street_state) ?? "TX",
    street_zip: trim(input.street_zip),
    county: trim(input.county),
    preferred_contact_method: trim(input.preferred_contact_method),
    company_name: trim(input.company_name),
    brokerage_name: trim(input.brokerage_name),
    trec_license_number: trim(input.trec_license_number),
    date_of_birth: trim(input.date_of_birth),
    occupation: trim(input.occupation),
    notes: trim(input.notes),
  };
}
