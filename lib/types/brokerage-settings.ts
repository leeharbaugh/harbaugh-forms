import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBrokerageCityStateZip } from "@/lib/types/buyer-rep-field-resolution";

export type BrokerageSettings = {
  id: number;
  create_date: string;
  update_date: string;
  status: string;

  agent_first_name: string | null;
  agent_middle_name: string | null;
  agent_last_name: string | null;
  agent_license_number: string | null;
  agent_phone: string | null;
  agent_email: string | null;
  agent_address: string | null;
  agent_city: string | null;
  agent_state: string | null;
  agent_zip: string | null;

  brokerage_name: string | null;
  brokerage_address: string | null;
  brokerage_city: string | null;
  brokerage_state: string | null;
  brokerage_zip: string | null;
  brokerage_office_phone: string | null;
  brokerage_license_number: string | null;
  brokerage_email: string | null;

  broker_first_name: string | null;
  broker_middle_name: string | null;
  broker_last_name: string | null;
  broker_license_number: string | null;
  broker_phone: string | null;
  broker_email: string | null;

  supervisor_name: string | null;
  supervisor_license_number: string | null;
  supervisor_phone: string | null;
  supervisor_email: string | null;
};

export type AgentProfileInput = {
  agent_first_name: string;
  agent_middle_name: string;
  agent_last_name: string;
  agent_license_number: string;
  agent_phone: string;
  agent_email: string;
  agent_address: string;
  agent_city: string;
  agent_state: string;
  agent_zip: string;
};

export type BrokerageProfileInput = {
  brokerage_name: string;
  brokerage_license_number: string;
  brokerage_address: string;
  brokerage_city: string;
  brokerage_state: string;
  brokerage_zip: string;
  brokerage_office_phone: string;
  brokerage_email: string;
  broker_first_name: string;
  broker_middle_name: string;
  broker_last_name: string;
  broker_license_number: string;
  broker_phone: string;
  broker_email: string;
};

export const emptyAgentProfileInput = (): AgentProfileInput => ({
  agent_first_name: "",
  agent_middle_name: "",
  agent_last_name: "",
  agent_license_number: "",
  agent_phone: "",
  agent_email: "",
  agent_address: "",
  agent_city: "",
  agent_state: "TX",
  agent_zip: "",
});

export const emptyBrokerageProfileInput = (): BrokerageProfileInput => ({
  brokerage_name: "",
  brokerage_address: "",
  brokerage_city: "",
  brokerage_state: "TX",
  brokerage_zip: "",
  brokerage_office_phone: "",
  brokerage_license_number: "",
  brokerage_email: "",
  broker_first_name: "",
  broker_middle_name: "",
  broker_last_name: "",
  broker_license_number: "",
  broker_phone: "",
  broker_email: "",
});

export function brokerageSettingsToAgentInput(
  settings: BrokerageSettings,
): AgentProfileInput {
  return {
    agent_first_name: settings.agent_first_name ?? "",
    agent_middle_name: settings.agent_middle_name ?? "",
    agent_last_name: settings.agent_last_name ?? "",
    agent_license_number: settings.agent_license_number ?? "",
    agent_phone: settings.agent_phone ?? "",
    agent_email: settings.agent_email ?? "",
    agent_address: settings.agent_address ?? "",
    agent_city: settings.agent_city ?? "",
    agent_state: settings.agent_state ?? "TX",
    agent_zip: settings.agent_zip ?? "",
  };
}

export function brokerageSettingsToBrokerageInput(
  settings: BrokerageSettings,
): BrokerageProfileInput {
  return {
    brokerage_name: settings.brokerage_name ?? "",
    brokerage_address: settings.brokerage_address ?? "",
    brokerage_city: settings.brokerage_city ?? "",
    brokerage_state: settings.brokerage_state ?? "TX",
    brokerage_zip: settings.brokerage_zip ?? "",
    brokerage_office_phone: settings.brokerage_office_phone ?? "",
    brokerage_license_number: settings.brokerage_license_number ?? "",
    brokerage_email: settings.brokerage_email ?? "",
    broker_first_name: settings.broker_first_name ?? "",
    broker_middle_name: settings.broker_middle_name ?? "",
    broker_last_name: settings.broker_last_name ?? "",
    broker_license_number: settings.broker_license_number ?? "",
    broker_phone: settings.broker_phone ?? "",
    broker_email: settings.broker_email ?? "",
  };
}

const trimToEmpty = (value: string) => value.trim();

const trimToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function normalizeAgentProfileInput(
  input: AgentProfileInput,
): AgentProfileInput {
  return {
    agent_first_name: trimToEmpty(input.agent_first_name),
    agent_middle_name: trimToEmpty(input.agent_middle_name),
    agent_last_name: trimToEmpty(input.agent_last_name),
    agent_license_number: trimToEmpty(input.agent_license_number),
    agent_phone: trimToEmpty(input.agent_phone),
    agent_email: trimToEmpty(input.agent_email),
    agent_address: trimToEmpty(input.agent_address),
    agent_city: trimToEmpty(input.agent_city),
    agent_state: trimToEmpty(input.agent_state) || "TX",
    agent_zip: trimToEmpty(input.agent_zip),
  };
}

export function normalizeBrokerageProfileInput(
  input: BrokerageProfileInput,
): BrokerageProfileInput {
  return {
    brokerage_name: trimToEmpty(input.brokerage_name),
    brokerage_address: trimToEmpty(input.brokerage_address),
    brokerage_city: trimToEmpty(input.brokerage_city),
    brokerage_state: trimToEmpty(input.brokerage_state) || "TX",
    brokerage_zip: trimToEmpty(input.brokerage_zip),
    brokerage_office_phone: trimToEmpty(input.brokerage_office_phone),
    brokerage_license_number: trimToEmpty(input.brokerage_license_number),
    brokerage_email: trimToEmpty(input.brokerage_email),
    broker_first_name: trimToEmpty(input.broker_first_name),
    broker_middle_name: trimToEmpty(input.broker_middle_name),
    broker_last_name: trimToEmpty(input.broker_last_name),
    broker_license_number: trimToEmpty(input.broker_license_number),
    broker_phone: trimToEmpty(input.broker_phone),
    broker_email: trimToEmpty(input.broker_email),
  };
}

export function agentProfileInputToRow(
  input: AgentProfileInput,
): Pick<
  BrokerageSettings,
  | "agent_first_name"
  | "agent_middle_name"
  | "agent_last_name"
  | "agent_license_number"
  | "agent_phone"
  | "agent_email"
  | "agent_address"
  | "agent_city"
  | "agent_state"
  | "agent_zip"
> {
  return {
    agent_first_name: trimToNull(input.agent_first_name),
    agent_middle_name: trimToNull(input.agent_middle_name),
    agent_last_name: trimToNull(input.agent_last_name),
    agent_license_number: trimToNull(input.agent_license_number),
    agent_phone: trimToNull(input.agent_phone),
    agent_email: trimToNull(input.agent_email),
    agent_address: trimToNull(input.agent_address),
    agent_city: trimToNull(input.agent_city),
    agent_state: trimToNull(input.agent_state),
    agent_zip: trimToNull(input.agent_zip),
  };
}

export function brokerageProfileInputToRow(
  input: BrokerageProfileInput,
): Pick<
  BrokerageSettings,
  | "brokerage_name"
  | "brokerage_address"
  | "brokerage_city"
  | "brokerage_state"
  | "brokerage_zip"
  | "brokerage_office_phone"
  | "brokerage_license_number"
  | "brokerage_email"
  | "broker_first_name"
  | "broker_middle_name"
  | "broker_last_name"
  | "broker_license_number"
  | "broker_phone"
  | "broker_email"
> {
  return {
    brokerage_name: trimToNull(input.brokerage_name),
    brokerage_address: trimToNull(input.brokerage_address),
    brokerage_city: trimToNull(input.brokerage_city),
    brokerage_state: trimToNull(input.brokerage_state),
    brokerage_zip: trimToNull(input.brokerage_zip),
    brokerage_office_phone: trimToNull(input.brokerage_office_phone),
    brokerage_license_number: trimToNull(input.brokerage_license_number),
    brokerage_email: trimToNull(input.brokerage_email),
    broker_first_name: trimToNull(input.broker_first_name),
    broker_middle_name: trimToNull(input.broker_middle_name),
    broker_last_name: trimToNull(input.broker_last_name),
    broker_license_number: trimToNull(input.broker_license_number),
    broker_phone: trimToNull(input.broker_phone),
    broker_email: trimToNull(input.broker_email),
  };
}

export function validateAgentProfileInput(input: AgentProfileInput): string | null {
  if (!input.agent_first_name) {
    return "Agent first name is required.";
  }
  if (!input.agent_last_name) {
    return "Agent last name is required.";
  }
  if (!input.agent_license_number) {
    return "Agent license number is required.";
  }
  if (!input.agent_phone) {
    return "Agent phone is required.";
  }
  if (!input.agent_email) {
    return "Agent email is required.";
  }
  return null;
}

export function validateBrokerageProfileInput(
  input: BrokerageProfileInput,
): string | null {
  if (!input.brokerage_name) {
    return "Brokerage name is required.";
  }
  if (!input.brokerage_address) {
    return "Brokerage address is required.";
  }
  if (!input.brokerage_city) {
    return "Brokerage city is required.";
  }
  if (!input.brokerage_state) {
    return "Brokerage state is required.";
  }
  if (!input.brokerage_zip) {
    return "Brokerage ZIP is required.";
  }
  if (!input.brokerage_office_phone) {
    return "Brokerage office phone is required.";
  }
  if (!input.broker_first_name) {
    return "Broker first name is required.";
  }
  if (!input.broker_last_name) {
    return "Broker last name is required.";
  }
  if (!input.broker_license_number) {
    return "Broker license number is required.";
  }
  if (!input.broker_phone) {
    return "Broker phone is required.";
  }
  if (!input.broker_email) {
    return "Broker email is required.";
  }
  return null;
}

export function formatPersonFullName(
  firstName: string | null,
  middleName: string | null,
  lastName: string | null,
): string {
  return [firstName, middleName, lastName]
    .map((part) => part?.trim())
    .filter((part) => part)
    .join(" ");
}

export function agentFullName(settings: Pick<
  BrokerageSettings,
  "agent_first_name" | "agent_middle_name" | "agent_last_name"
>): string {
  return formatPersonFullName(
    settings.agent_first_name,
    settings.agent_middle_name,
    settings.agent_last_name,
  );
}

export function brokerFullName(settings: Pick<
  BrokerageSettings,
  "broker_first_name" | "broker_middle_name" | "broker_last_name"
>): string {
  return formatPersonFullName(
    settings.broker_first_name,
    settings.broker_middle_name,
    settings.broker_last_name,
  );
}

export function resolveBrokerageSettingsField(
  settings: BrokerageSettings,
  field: string,
): string | null {
  switch (field) {
    case "agent_full_name":
      return agentFullName(settings) || null;
    case "broker_full_name":
      return brokerFullName(settings) || null;
    case "brokerage_phone":
      return settings.brokerage_office_phone;
    case "brokerage_city_state_zip":
      return formatBrokerageCityStateZip(settings) || null;
    default:
      if (field in settings) {
        const value = settings[field as keyof BrokerageSettings];
        return typeof value === "string" ? value : null;
      }
      return null;
  }
}

export async function fetchActiveBrokerageSettings(
  supabase: SupabaseClient,
): Promise<BrokerageSettings | null> {
  const { data, error } = await supabase
    .from("brokerage_settings")
    .select("*")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as BrokerageSettings | null) ?? null;
}
