export type ContactType = "INDIVIDUAL" | "ENTITY";

export type Contact = {
  id: number;
  contact_type: ContactType;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  entity_name: string | null;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  notes: string | null;
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
  entity_name: string | null;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  notes: string | null;
};

export const emptyContactInput = (): ContactInput => ({
  contact_type: "INDIVIDUAL",
  first_name: null,
  middle_name: null,
  last_name: null,
  suffix: null,
  entity_name: null,
  email: null,
  phone_primary: null,
  phone_secondary: null,
  mailing_address_line_1: null,
  mailing_address_line_2: null,
  mailing_city: null,
  mailing_state: "TX",
  mailing_zip: null,
  notes: null,
});

export function contactToInput(contact: Contact): ContactInput {
  return {
    contact_type: contact.contact_type,
    first_name: contact.first_name,
    middle_name: contact.middle_name,
    last_name: contact.last_name,
    suffix: contact.suffix,
    entity_name: contact.entity_name,
    email: contact.email,
    phone_primary: contact.phone_primary,
    phone_secondary: contact.phone_secondary,
    mailing_address_line_1: contact.mailing_address_line_1,
    mailing_address_line_2: contact.mailing_address_line_2,
    mailing_city: contact.mailing_city,
    mailing_state: contact.mailing_state ?? "TX",
    mailing_zip: contact.mailing_zip,
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

  const parts = [contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
    .filter(Boolean)
    .join(" ");

  return parts || "Unnamed contact";
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
    entity_name: trim(input.entity_name),
    email: trim(input.email),
    phone_primary: trim(input.phone_primary),
    phone_secondary: trim(input.phone_secondary),
    mailing_address_line_1: trim(input.mailing_address_line_1),
    mailing_address_line_2: trim(input.mailing_address_line_2),
    mailing_city: trim(input.mailing_city),
    mailing_state: trim(input.mailing_state) ?? "TX",
    mailing_zip: trim(input.mailing_zip),
    notes: trim(input.notes),
  };
}
