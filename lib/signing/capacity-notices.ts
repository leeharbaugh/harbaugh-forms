/**
 * Native Signing capacity / representation helpers and notices.
 *
 * Representative signing is first-class for the initial release via one
 * generic stated-capacity model. Harbaugh Forms records the relationship and
 * does not validate legal authority.
 */

export const NATIVE_SIGNING_TYPED_ONLY_NOTICE =
  "Participants may adopt typed signatures and initials only. Drawn marks are not available yet." as const;

export const NATIVE_SIGNING_REPRESENTATIVE_NOTICE =
  "Representative signing is supported. Prepare personal or representative capacity before Send. Harbaugh Forms records the stated capacity and does not validate legal authority." as const;

export const SIGNING_CAPACITY_MODES = ["PERSONAL", "REPRESENTATIVE"] as const;
export type SigningCapacityMode = (typeof SIGNING_CAPACITY_MODES)[number];

export const SIGNING_CAPACITY_LABELS = [
  "ATTORNEY_IN_FACT",
  "TRUSTEE",
  "GUARDIAN",
  "AUTHORIZED_ENTITY_REPRESENTATIVE",
  "EXECUTOR_ADMINISTRATOR",
  "OTHER",
] as const;
export type SigningCapacityLabel = (typeof SIGNING_CAPACITY_LABELS)[number];

export const SIGNING_CAPACITY_LABEL_OPTIONS: {
  value: SigningCapacityLabel;
  label: string;
}[] = [
  { value: "ATTORNEY_IN_FACT", label: "Attorney-in-Fact / Power of Attorney" },
  { value: "TRUSTEE", label: "Trustee" },
  { value: "GUARDIAN", label: "Guardian" },
  {
    value: "AUTHORIZED_ENTITY_REPRESENTATIVE",
    label: "Authorized Entity Representative",
  },
  { value: "EXECUTOR_ADMINISTRATOR", label: "Executor / Administrator" },
  { value: "OTHER", label: "Other" },
];

export function isSigningCapacityMode(
  value: unknown,
): value is SigningCapacityMode {
  return (
    typeof value === "string" &&
    (SIGNING_CAPACITY_MODES as readonly string[]).includes(value)
  );
}

export function isSigningCapacityLabel(
  value: unknown,
): value is SigningCapacityLabel {
  return (
    typeof value === "string" &&
    (SIGNING_CAPACITY_LABELS as readonly string[]).includes(value)
  );
}

export function suggestCapacityWording(options: {
  signatoryName: string;
  representedPartyName: string;
  capacityLabel: SigningCapacityLabel;
}): string {
  const signatory = options.signatoryName.trim();
  const represented = options.representedPartyName.trim();
  switch (options.capacityLabel) {
    case "ATTORNEY_IN_FACT":
      return `${signatory} as Attorney-in-Fact for ${represented}`;
    case "TRUSTEE":
      return `${signatory} as Trustee of ${represented}`;
    case "GUARDIAN":
      return `${signatory} as Guardian for ${represented}`;
    case "AUTHORIZED_ENTITY_REPRESENTATIVE":
      return `${signatory} as Authorized Representative of ${represented}`;
    case "EXECUTOR_ADMINISTRATOR":
      return `${signatory} as Executor/Administrator of ${represented}`;
    case "OTHER":
      return `${signatory} for ${represented}`;
  }
}

/** Typed Signature expected text: personal name or representative wording. */
export function expectedTypedSignatureText(options: {
  capacityMode: SigningCapacityMode;
  signatoryName: string;
  capacityWording: string | null | undefined;
}): string {
  if (options.capacityMode === "REPRESENTATIVE") {
    return (options.capacityWording ?? "").trim();
  }
  return options.signatoryName.trim();
}
