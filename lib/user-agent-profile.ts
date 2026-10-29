import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneInput } from "@/lib/phone-format";
import {
  type AgentProfileInput,
  emptyAgentProfileInput,
  formatPersonFullName,
} from "@/lib/types/brokerage-settings";
import type { UserAgentSettings } from "@/lib/types/user-agent-settings";

/**
 * Agent identity on forms is personal: it comes from the packet owner's own
 * `user_agent_settings` row, never from the organization's shared
 * `brokerage_settings` row and never from another agent.
 */
export function isAgentIdentitySourcePath(path: string | null | undefined): boolean {
  return (path ?? "").trim().toLowerCase().startsWith("agent_");
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/**
 * Explicit `agent_*` source path → `user_agent_settings` column mapping.
 * Unknown agent paths resolve to null; they never fall through to brokerage data.
 */
export function resolveUserAgentSettingsField(
  profile: UserAgentSettings | null,
  sourcePath: string,
): string | null {
  if (!profile) {
    return null;
  }

  switch (sourcePath.trim().toLowerCase()) {
    case "agent_first_name":
      return nonBlank(profile.legal_first_name);
    case "agent_middle_name":
      return nonBlank(profile.legal_middle_name);
    case "agent_last_name":
      return nonBlank(profile.legal_last_name);
    case "agent_full_name":
      return nonBlank(
        formatPersonFullName(
          profile.legal_first_name,
          profile.legal_middle_name,
          profile.legal_last_name,
        ),
      );
    case "agent_license_number":
      return nonBlank(profile.trec_license_number);
    case "agent_phone":
      return nonBlank(profile.phone);
    case "agent_email":
      return nonBlank(profile.email);
    case "agent_address": {
      const lines = [profile.address_line_1, profile.address_line_2]
        .map(nonBlank)
        .filter((line): line is string => line != null);
      return lines.length > 0 ? lines.join(", ") : null;
    }
    case "agent_city":
      return nonBlank(profile.city);
    case "agent_state":
      return nonBlank(profile.state);
    case "agent_zip":
      return nonBlank(profile.zip);
    default:
      return null;
  }
}

/** The packet owner's ACTIVE agent profile; inactive or missing rows resolve nothing. */
export async function fetchActiveUserAgentSettings(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<UserAgentSettings | null> {
  const ownerId = userId?.trim();
  if (!ownerId) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_agent_settings")
    .select("*")
    .eq("user_id", ownerId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserAgentSettings | null) ?? null;
}

export function userAgentSettingsToAgentInput(
  profile: UserAgentSettings | null,
): AgentProfileInput {
  if (!profile) {
    return emptyAgentProfileInput();
  }

  return {
    agent_first_name: profile.legal_first_name ?? "",
    agent_middle_name: profile.legal_middle_name ?? "",
    agent_last_name: profile.legal_last_name ?? "",
    agent_license_number: profile.trec_license_number ?? "",
    agent_phone: profile.phone ?? "",
    agent_email: profile.email ?? "",
    agent_address: profile.address_line_1 ?? "",
    agent_address_line_2: profile.address_line_2 ?? "",
    agent_city: profile.city ?? "",
    agent_state: profile.state ?? "TX",
    agent_zip: profile.zip ?? "",
  };
}

/** Same normalization as admin user management (`upsertAdminAgentSettings`). */
export function agentInputToUserAgentSettingsColumns(input: AgentProfileInput) {
  const phone = nonBlank(input.agent_phone);
  return {
    legal_first_name: nonBlank(input.agent_first_name),
    legal_middle_name: nonBlank(input.agent_middle_name),
    legal_last_name: nonBlank(input.agent_last_name),
    trec_license_number: nonBlank(input.agent_license_number),
    phone: phone ? formatPhoneInput(phone) : null,
    email: nonBlank(input.agent_email)?.toLowerCase() ?? null,
    address_line_1: nonBlank(input.agent_address),
    address_line_2: nonBlank(input.agent_address_line_2),
    city: nonBlank(input.agent_city),
    state: (nonBlank(input.agent_state)?.toUpperCase() || "TX").slice(0, 2),
    zip: nonBlank(input.agent_zip),
  };
}

async function requireSignedInUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }
  if (!user) {
    throw new Error("You must be signed in to manage your agent profile.");
  }
  return user.id;
}

/** Signed-in user's own agent profile row (any status), for Settings. */
export async function loadCurrentUserAgentProfile(
  supabase: SupabaseClient,
): Promise<UserAgentSettings | null> {
  const userId = await requireSignedInUserId(supabase);
  const { data, error } = await supabase
    .from("user_agent_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserAgentSettings | null) ?? null;
}

/**
 * Save the signed-in user's own agent profile. The row key is always the
 * authenticated user, so ordinary Settings can never write another agent's
 * profile; RLS (`user_id = auth.uid()`) enforces the same boundary.
 * Status is admin-managed: an inactive row is not reactivated here.
 */
export async function saveCurrentUserAgentProfile(
  supabase: SupabaseClient,
  input: AgentProfileInput,
): Promise<UserAgentSettings> {
  const userId = await requireSignedInUserId(supabase);
  const existing = await loadCurrentUserAgentProfile(supabase);
  if (existing && existing.status !== "ACTIVE") {
    throw new Error(
      "Your agent profile is inactive. Ask an administrator to reactivate it.",
    );
  }

  const columns = agentInputToUserAgentSettingsColumns(input);
  const { data, error } = existing
    ? await supabase
        .from("user_agent_settings")
        .update(columns)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .select("*")
        .single()
    : await supabase
        .from("user_agent_settings")
        .insert({ ...columns, user_id: userId, status: "ACTIVE" })
        .select("*")
        .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserAgentSettings;
}
