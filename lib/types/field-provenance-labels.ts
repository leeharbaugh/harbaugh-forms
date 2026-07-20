/**
 * Readable provenance labels for template (Filled from) and packet Fill Form
 * (Value source). Dependency-free for Node strip-types tests.
 */

export type PacketValueSourceLabel =
  | "Entered manually"
  | "From property"
  | "From client"
  | "From agent profile"
  | "From brokerage"
  | "From packet"
  | "From your default"
  | "From organization default"
  | "Blank"
  | "From form mapping"
  | "Default"
  | "Unknown";

export type FilledFromLabel = string;

/**
 * Template-editor "Filled from" label from catalog field automatic source.
 * Never exposes raw resolver keys as the primary regular-user answer when a
 * human category is available; returns "Not connected" when unmapped.
 */
export function formatFilledFromLabel(field: {
  source_type?: string | null;
  source_path?: string | null;
  resolver_key?: string | null;
  fallback_value?: string | null;
} | null | undefined): FilledFromLabel {
  if (!field) {
    return "Not connected";
  }

  const sourceType = (field.source_type ?? "").trim().toLowerCase();
  if (!sourceType || sourceType === "manual_only" || sourceType === "packet_instance") {
    return "Not connected";
  }

  const path = (field.source_path ?? "").trim().toLowerCase();

  if (sourceType === "packet_property") {
    if (path.includes("county")) {
      return "Property county";
    }
    if (path.includes("city")) {
      return "Property city";
    }
    if (path.includes("street") || path.includes("address")) {
      return "Property address";
    }
    if (path.includes("zip") || path.includes("postal")) {
      return "Property ZIP";
    }
    if (path.includes("state")) {
      return "Property state";
    }
    return "Property";
  }

  if (sourceType === "packet_contact") {
    if (path.includes("email")) {
      return "Client email";
    }
    if (path.includes("phone")) {
      return "Client phone";
    }
    if (path.includes("name") || path.includes("full_name")) {
      return "Client name";
    }
    return "Client";
  }

  if (sourceType === "settings_agent") {
    if (path.includes("license")) {
      return "Agent license number";
    }
    if (path.includes("phone")) {
      return "Agent phone";
    }
    if (path.includes("email")) {
      return "Agent email";
    }
    if (path.includes("name")) {
      return "Agent name";
    }
    return "Agent profile";
  }

  if (sourceType === "settings_brokerage") {
    if (path.includes("license")) {
      return "Brokerage license number";
    }
    if (path.includes("phone")) {
      return "Brokerage phone";
    }
    if (path.includes("email")) {
      return "Brokerage email";
    }
    if (path.includes("name") && path.includes("broker") && !path.includes("brokerage")) {
      return "Broker name";
    }
    if (path.includes("brokerage_name") || path === "name" || path.endsWith(".name")) {
      return "Brokerage name";
    }
    if (path.includes("address") || path.includes("city") || path.includes("zip")) {
      return "Brokerage address";
    }
    return "Brokerage";
  }

  if (
    sourceType === "packet" ||
    sourceType === "buyer_rep_details" ||
    sourceType === "listing_agreement_details" ||
    sourceType === "contract_details" ||
    sourceType === "representation_agreement"
  ) {
    return "Packet details";
  }

  if (sourceType === "custom_resolver") {
    return "Custom form data";
  }

  if (sourceType === "static_default") {
    return "Form constant";
  }

  return "Connected data";
}

/**
 * Fill Form "Value source" from persisted field_instances.source / is_override.
 * Does not guess Personal vs Organization when source is ambiguous — only uses
 * explicit private_default / organization_default (or is_override).
 */
export function formatPacketValueSourceLabel(options: {
  source?: string | null;
  isOverride?: boolean | null;
  displayValue?: string | null;
}): PacketValueSourceLabel {
  if (options.isOverride) {
    return "Entered manually";
  }

  const source = (options.source ?? "").trim().toLowerCase();

  if (!source || source === "empty") {
    const value = options.displayValue ?? "";
    if (value.trim() === "") {
      return "Blank";
    }
    return "Unknown";
  }

  switch (source) {
    case "manual_override":
      return "Entered manually";
    case "property":
      return "From property";
    case "contact_role":
      return "From client";
    case "settings":
      // settings covers agent + brokerage; prefer brokerage wording only when
      // we cannot distinguish — callers may refine via source_type if available.
      return "From agent profile";
    case "packet":
      return "From packet";
    case "private_default":
      return "From your default";
    case "organization_default":
      return "From organization default";
    case "mapping_override":
      return "From form mapping";
    case "fallback":
    case "field_default":
    case "field_default_checked":
      // Legacy / ambiguous catalog default snapshots — do not guess Personal vs Org.
      return "Default";
    default:
      break;
  }

  // Some older rows may store catalog source_type-like strings.
  if (source.startsWith("packet_property") || source === "packet_property") {
    return "From property";
  }
  if (source.startsWith("packet_contact") || source === "packet_contact") {
    return "From client";
  }
  if (source.startsWith("settings_agent") || source === "settings_agent") {
    return "From agent profile";
  }
  if (
    source.startsWith("settings_brokerage") ||
    source === "settings_brokerage"
  ) {
    return "From brokerage";
  }

  return "Unknown";
}

/**
 * Refine settings-based value source when catalog field source_type is known.
 */
export function refinePacketValueSourceLabel(options: {
  source?: string | null;
  isOverride?: boolean | null;
  displayValue?: string | null;
  fieldSourceType?: string | null;
}): PacketValueSourceLabel {
  const base = formatPacketValueSourceLabel(options);
  if (options.isOverride || base !== "From agent profile") {
    return base;
  }
  const fieldSourceType = (options.fieldSourceType ?? "").trim().toLowerCase();
  if (fieldSourceType === "settings_brokerage") {
    return "From brokerage";
  }
  return base;
}

/** True when a label looks like a raw internal code that must not be shown. */
export function isRawInternalSourceCode(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === "manual_override" ||
    normalized === "private_default" ||
    normalized === "organization_default" ||
    normalized === "field_default" ||
    normalized === "field_default_checked" ||
    normalized === "fallback" ||
    normalized.includes(".") ||
    normalized.includes("_")
  );
}

/**
 * Compact “Why this value?” body for Fill Form disclosures.
 * Does not recalculate packet values — only explains stored provenance.
 */
export function describePacketValueProvenance(options: {
  valueSourceLabel: PacketValueSourceLabel;
  filledFromLabel: string;
  currentValue?: string | null;
}): string {
  const filledFrom = options.filledFromLabel.trim() || "Not connected";
  const current =
    options.currentValue == null || options.currentValue === ""
      ? "(blank)"
      : options.currentValue;

  switch (options.valueSourceLabel) {
    case "Entered manually":
      return `This field was entered manually.\n\nFilled from:\n${filledFrom}\n\nThe manual value takes precedence.`;
    case "From property":
      return `This value came from property data.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "From client":
      return `This value came from client/contact data.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "From agent profile":
      return `This value came from the agent profile.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "From brokerage":
      return `This value came from brokerage settings.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "From packet":
      return `This value came from packet-specific structured data.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "From your default":
      return `This value came from your Personal default.\n\nFilled from:\n${filledFrom}\n\nDefault if blank:\n${current}`;
    case "From organization default":
      return `This value came from an Organization default.\n\nFilled from:\n${filledFrom}\n\nDefault if blank:\n${current}`;
    case "Default":
      return `This value came from a default.\n\nFilled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
    case "Blank":
      return `This field is currently blank.\n\nFilled from:\n${filledFrom}`;
    default:
      return `Filled from:\n${filledFrom}\n\nCurrent value:\n${current}`;
  }
}
