/**
 * Live Draft participant identity.
 *
 * While a Signing is Draft (no package revision yet), a linked participant's
 * name and email come from its authoritative source and follow it:
 *   - linked Contact (Packet / Contact participants),
 *   - the linked User's profile ("Include me"),
 *   - the originating organization's active brokerage profile ("Include broker").
 * Ad hoc participants have no source and keep what the manager typed.
 *
 * Activation (Send / Begin In-Person) is the canonization boundary: the
 * revision freezes name/email, a database trigger rejects later changes, and
 * nothing here runs once the Signing has a revision or leaves Draft.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatContactDisplayName, hasUsableContactDisplayName } from "@/lib/types/contact";
import type { Contact } from "@/lib/types/contact";
import { brokerFullName } from "@/lib/types/brokerage-settings";
import type { BrokerageSettings } from "@/lib/types/brokerage-settings";
import { formatProfileDisplayName } from "@/lib/types/profile";
import type { Profile } from "@/lib/types/profile";
import type { SigningRow } from "./types";

export type ParticipantIdentitySourceKind = "CONTACT" | "USER" | "BROKER" | "AD_HOC";

export type LinkedParticipantRow = {
  id: string;
  full_name: string;
  email: string;
  linked_contact_id: number | null;
  linked_user_id: string | null;
  linked_brokerage_settings_id: number | null;
};

export type AuthoritativeIdentity = { fullName: string; email: string };

/** Contact > User > broker profile; a row with none of them is ad hoc. */
export function participantIdentitySourceKind(
  row: Pick<
    LinkedParticipantRow,
    "linked_contact_id" | "linked_user_id" | "linked_brokerage_settings_id"
  >,
): ParticipantIdentitySourceKind {
  if (row.linked_contact_id != null) return "CONTACT";
  if (row.linked_user_id != null) return "USER";
  if (row.linked_brokerage_settings_id != null) return "BROKER";
  return "AD_HOC";
}

export function isLinkedParticipant(
  row: Pick<
    LinkedParticipantRow,
    "linked_contact_id" | "linked_user_id" | "linked_brokerage_settings_id"
  >,
): boolean {
  return participantIdentitySourceKind(row) !== "AD_HOC";
}

/** Draft preparation is open only while Draft and before any revision exists. */
export function isDraftIdentityLive(
  signing: Pick<SigningRow, "lifecycle_state" | "current_package_revision_id">,
): boolean {
  return (
    signing.lifecycle_state === "DRAFT" &&
    signing.current_package_revision_id == null
  );
}

export function contactSignerIdentity(
  contact: Contact,
): AuthoritativeIdentity | null {
  if (contact.status !== "ACTIVE") return null;
  if (!hasUsableContactDisplayName(contact)) return null;
  const fullName = formatContactDisplayName(contact).trim();
  if (!fullName) return null;
  return {
    fullName: fullName.slice(0, 200),
    email: (contact.email ?? "").trim().toLowerCase(),
  };
}

export function userSignerIdentity(
  profile: Profile,
  authEmail: string | null | undefined,
): AuthoritativeIdentity | null {
  const fullName = formatProfileDisplayName(profile).trim();
  if (!fullName) return null;
  return {
    fullName: fullName.slice(0, 200),
    email: (authEmail ?? profile.email ?? "").trim().toLowerCase(),
  };
}

export function brokerSignerIdentityFromSettings(
  settings: BrokerageSettings,
): AuthoritativeIdentity | null {
  const fullName = brokerFullName(settings).trim();
  const email = (settings.broker_email ?? "").trim().toLowerCase();
  if (!fullName || !email) return null;
  return { fullName: fullName.slice(0, 200), email };
}

/**
 * Users whose Contacts may back this Signing's participants: the Signing's
 * sender/creator and the source Packet owner. A link to anyone else's
 * Contact is never followed.
 */
async function allowedContactOwnerIds(
  admin: SupabaseClient,
  signing: SigningRow,
): Promise<Set<string>> {
  const owners = new Set<string>();
  if (signing.original_sender_user_id) owners.add(signing.original_sender_user_id);
  if (signing.created_by_user_id) owners.add(signing.created_by_user_id);
  if (signing.source_packet_id != null) {
    const { data, error } = await admin
      .from("packets")
      .select("owner_user_id")
      .eq("id", signing.source_packet_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.owner_user_id) owners.add(data.owner_user_id as string);
  }
  return owners;
}

/**
 * Resolve the current authoritative identity for each linked participant.
 * Missing, inactive, foreign, or unusable sources resolve to nothing, and
 * the participant keeps its last values.
 */
export async function resolveAuthoritativeIdentities(
  admin: SupabaseClient,
  signing: SigningRow,
  rows: LinkedParticipantRow[],
): Promise<Map<string, AuthoritativeIdentity>> {
  const result = new Map<string, AuthoritativeIdentity>();
  const contactIds = new Set<number>();
  const userIds = new Set<string>();
  const brokerIds = new Set<number>();
  for (const row of rows) {
    const kind = participantIdentitySourceKind(row);
    if (kind === "CONTACT") contactIds.add(row.linked_contact_id!);
    if (kind === "USER") userIds.add(row.linked_user_id!);
    if (kind === "BROKER") brokerIds.add(row.linked_brokerage_settings_id!);
  }

  const contacts = new Map<number, AuthoritativeIdentity>();
  if (contactIds.size > 0) {
    const owners = await allowedContactOwnerIds(admin, signing);
    const { data, error } = await admin
      .from("contacts")
      .select("*")
      .in("id", [...contactIds]);
    if (error) throw new Error(error.message);
    for (const contact of (data ?? []) as Contact[]) {
      if (!contact.owner_user_id || !owners.has(contact.owner_user_id)) continue;
      const identity = contactSignerIdentity(contact);
      if (identity) contacts.set(contact.id, identity);
    }
  }

  const users = new Map<string, AuthoritativeIdentity>();
  for (const userId of userIds) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) continue;
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const identity = userSignerIdentity(
      profile as Profile,
      authUser?.user?.email ?? null,
    );
    if (identity) users.set(userId, identity);
  }

  const brokers = new Map<number, AuthoritativeIdentity>();
  if (brokerIds.size > 0) {
    const { data, error } = await admin
      .from("brokerage_settings")
      .select("*")
      .in("id", [...brokerIds])
      .eq("organization_id", signing.originating_organization_id)
      .eq("status", "ACTIVE");
    if (error) throw new Error(error.message);
    for (const settings of (data ?? []) as BrokerageSettings[]) {
      const identity = brokerSignerIdentityFromSettings(settings);
      if (identity) brokers.set(settings.id, identity);
    }
  }

  for (const row of rows) {
    const kind = participantIdentitySourceKind(row);
    const identity =
      kind === "CONTACT"
        ? contacts.get(row.linked_contact_id!)
        : kind === "USER"
          ? users.get(row.linked_user_id!)
          : kind === "BROKER"
            ? brokers.get(row.linked_brokerage_settings_id!)
            : undefined;
    if (identity) result.set(row.id, identity);
  }
  return result;
}

const LINKED_ROW_COLUMNS =
  "id, full_name, email, linked_contact_id, linked_user_id, linked_brokerage_settings_id";

/**
 * Bring linked Draft participants' name/email in line with their sources.
 * Caller must already have authorized Draft management. No-op unless the
 * Signing is Draft with no revision; a concurrent activation makes the
 * freeze trigger reject the write, which is ignored (frozen wins).
 */
export async function syncDraftParticipantIdentities(
  admin: SupabaseClient,
  signing: SigningRow,
): Promise<{ updatedParticipantIds: string[] }> {
  if (!isDraftIdentityLive(signing)) return { updatedParticipantIds: [] };

  const { data, error } = await admin
    .from("signing_participants")
    .select(LINKED_ROW_COLUMNS)
    .eq("signing_id", signing.id)
    .neq("participant_status", "REMOVED");
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as LinkedParticipantRow[]).filter(isLinkedParticipant);
  if (rows.length === 0) return { updatedParticipantIds: [] };

  const identities = await resolveAuthoritativeIdentities(admin, signing, rows);
  const updatedParticipantIds: string[] = [];
  for (const row of rows) {
    const identity = identities.get(row.id);
    if (!identity) continue;
    if (identity.fullName === row.full_name && identity.email === row.email) {
      continue;
    }
    const { error: updateError } = await admin
      .from("signing_participants")
      .update({ full_name: identity.fullName, email: identity.email })
      .eq("id", row.id)
      .eq("signing_id", signing.id);
    if (updateError) {
      if (updateError.message.includes("SIGNING_PARTICIPANT_IDENTITY_FROZEN")) {
        return { updatedParticipantIds };
      }
      throw new Error(updateError.message);
    }
    updatedParticipantIds.push(row.id);
  }
  return { updatedParticipantIds };
}
