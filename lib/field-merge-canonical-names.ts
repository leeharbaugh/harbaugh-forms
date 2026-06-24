import {
  detectFormSpecificPrefixes,
  stripFormSpecificPrefixes,
} from "@/lib/field-merge-candidates";

export const FIELD_MERGE_REVIEW_WARNING =
  "Review carefully before merging. Fields should only be merged when they represent the same business concept.";

export type FieldMergeCanonicalNameSuggestion = {
  fieldKey: string;
  fieldLabel: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type FieldMergeCanonicalNameAdvice = {
  primary: FieldMergeCanonicalNameSuggestion | null;
  alternatives: FieldMergeCanonicalNameSuggestion[];
  notes: string[];
};

export type CanonicalNameSuggestionInput = {
  fieldKey: string;
  formSpecificPrefixes: string[];
};

type PartyContext = "buyer" | "seller" | "neutral";

const PREFIX_PARTY_CONTEXT: Record<string, PartyContext> = {
  buyer_rep_: "buyer",
  listing_: "seller",
};

type SemanticUpgradeRule = {
  matches: (strippedKey: string) => boolean;
  fieldKey: string;
  fieldLabel: string;
  rationale: string;
};

const SEMANTIC_UPGRADE_RULES: SemanticUpgradeRule[] = [
  {
    matches: (strippedKey) =>
      strippedKey === "broker_signature_checkbox" ||
      strippedKey === "broker_signature" ||
      /^broker_.*signature.*checkbox$/.test(strippedKey),
    fieldKey: "broker_signs_in_lieu_checkbox",
    fieldLabel: "Broker signs in lieu checkbox",
    rationale:
      "Buyer rep and listing broker signature checkboxes usually indicate the broker signs in lieu of the party.",
  },
];

function normalizeKey(fieldKey: string): string {
  return fieldKey.trim().toLowerCase();
}

function tokenizeFieldKey(fieldKey: string): string[] {
  return normalizeKey(fieldKey).split("_").filter(Boolean);
}

function formatSuggestedLabel(fieldKey: string): string {
  return fieldKey
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function longestCommonTokenSuffix(tokenLists: string[][]): string[] {
  if (tokenLists.length === 0) {
    return [];
  }

  const reversed = tokenLists.map((tokens) => [...tokens].reverse());
  const suffix: string[] = [];

  for (let index = 0; index < reversed[0].length; index += 1) {
    const token = reversed[0][index];
    if (reversed.every((tokens) => tokens[index] === token)) {
      suffix.unshift(token);
    } else {
      break;
    }
  }

  return suffix;
}

function detectPartyContexts(
  entries: CanonicalNameSuggestionInput[],
): Set<PartyContext> {
  const contexts = new Set<PartyContext>();

  for (const entry of entries) {
    let matched = false;
    for (const prefix of entry.formSpecificPrefixes) {
      const party = PREFIX_PARTY_CONTEXT[prefix];
      if (party) {
        contexts.add(party);
        matched = true;
      }
    }

    if (!matched) {
      contexts.add("neutral");
    }
  }

  return contexts;
}

function isClientNameKey(strippedKey: string): boolean {
  return (
    strippedKey === "client_name" ||
    strippedKey.endsWith("_client_name") ||
    strippedKey === "client" ||
    strippedKey.endsWith("_client")
  );
}

function buildSuggestion(
  fieldKey: string,
  confidence: FieldMergeCanonicalNameSuggestion["confidence"],
  rationale: string,
): FieldMergeCanonicalNameSuggestion {
  return {
    fieldKey,
    fieldLabel: formatSuggestedLabel(fieldKey),
    confidence,
    rationale,
  };
}

function applySemanticUpgrade(
  strippedKey: string,
): FieldMergeCanonicalNameSuggestion | null {
  for (const rule of SEMANTIC_UPGRADE_RULES) {
    if (rule.matches(strippedKey)) {
      return buildSuggestion(rule.fieldKey, "high", rule.rationale);
    }
  }

  return null;
}

function suggestClientNameCanonical(
  entries: CanonicalNameSuggestionInput[],
  strippedKeys: string[],
): FieldMergeCanonicalNameAdvice {
  const partyContexts = detectPartyContexts(entries);
  const hasBuyer = partyContexts.has("buyer");
  const hasSeller = partyContexts.has("seller");
  const hasNeutral = partyContexts.has("neutral");
  const notes: string[] = [
    "Client name fields from different agreement types may refer to different parties.",
  ];

  if (hasBuyer && hasSeller) {
    return {
      primary: null,
      alternatives: [
        buildSuggestion(
          "buyer_1_full_name",
          "medium",
          "Use when the merged field should represent the buyer/client on a buyer rep agreement.",
        ),
        buildSuggestion(
          "seller_1_full_name",
          "medium",
          "Use when the merged field should represent the seller/client on a listing agreement.",
        ),
      ],
      notes: [
        ...notes,
        "Avoid contact_full_name unless the field truly represents the same person across both contexts.",
      ],
    };
  }

  if (hasBuyer && !hasSeller && !hasNeutral) {
    return {
      primary: buildSuggestion(
        "buyer_1_full_name",
        "high",
        "All candidates use buyer rep prefixes, so a buyer-specific name is clearer than a generic contact name.",
      ),
      alternatives: [
        buildSuggestion(
          "contact_full_name",
          "low",
          "Only use a generic contact name if this field is reused outside buyer rep agreements.",
        ),
      ],
      notes,
    };
  }

  if (hasSeller && !hasBuyer && !hasNeutral) {
    return {
      primary: buildSuggestion(
        "seller_1_full_name",
        "high",
        "All candidates use listing prefixes, so a seller-specific name is clearer than a generic contact name.",
      ),
      alternatives: [
        buildSuggestion(
          "contact_full_name",
          "low",
          "Only use a generic contact name if this field is reused outside listing agreements.",
        ),
      ],
      notes,
    };
  }

  if (hasNeutral && !hasBuyer && !hasSeller) {
    return {
      primary: buildSuggestion(
        "contact_full_name",
        "medium",
        "No form-specific prefixes were detected, so a generic contact name may be appropriate.",
      ),
      alternatives: [],
      notes,
    };
  }

  const uniqueStripped = [...new Set(strippedKeys)];
  const fallbackKey = uniqueStripped[0] ?? "contact_full_name";

  return {
    primary: buildSuggestion(
      fallbackKey,
      "low",
      "Mixed or unclear party context. Prefer a role-specific name over a generic contact name.",
    ),
    alternatives: [
      buildSuggestion(
        "buyer_1_full_name",
        "low",
        "Buyer-side alternative when the field is buyer-specific.",
      ),
      buildSuggestion(
        "seller_1_full_name",
        "low",
        "Seller-side alternative when the field is listing-specific.",
      ),
      buildSuggestion(
        "contact_full_name",
        "low",
        "Generic alternative only if the same person concept applies everywhere.",
      ),
    ],
    notes,
  };
}

function suggestFromSharedStrippedKey(
  strippedKey: string,
  entries: CanonicalNameSuggestionInput[],
): FieldMergeCanonicalNameAdvice {
  if (isClientNameKey(strippedKey)) {
    return suggestClientNameCanonical(
      entries,
      entries.map((entry) => stripFormSpecificPrefixes(entry.fieldKey)),
    );
  }

  const semanticUpgrade = applySemanticUpgrade(strippedKey);
  if (semanticUpgrade) {
    const hasFormPrefixes = entries.some(
      (entry) => entry.formSpecificPrefixes.length > 0,
    );

    return {
      primary: semanticUpgrade,
      alternatives: hasFormPrefixes
        ? [
            buildSuggestion(
              strippedKey,
              "medium",
              "Shared stripped key without the business-meaning rename.",
            ),
          ]
        : [],
      notes: hasFormPrefixes
        ? [
            "Prefer the business-meaning name over the stripped form-specific key.",
          ]
        : [],
    };
  }

  const hasFormPrefixes = entries.some(
    (entry) => entry.formSpecificPrefixes.length > 0,
  );

  return {
    primary: buildSuggestion(
      strippedKey,
      hasFormPrefixes ? "medium" : "high",
      hasFormPrefixes
        ? "Fields share the same core key after removing form-specific prefixes."
        : "Fields already use a reusable key without form-specific prefixes.",
    ),
    alternatives: [],
    notes: hasFormPrefixes
      ? ["Avoid keeping form prefixes in the canonical name unless the field only applies to one form."]
      : [],
  };
}

function suggestFromCommonSuffix(
  suffixTokens: string[],
  entries: CanonicalNameSuggestionInput[],
): FieldMergeCanonicalNameAdvice {
  const suffixKey = suffixTokens.join("_");
  const semanticUpgrade = applySemanticUpgrade(suffixKey);

  if (semanticUpgrade) {
    return {
      primary: semanticUpgrade,
      alternatives: [
        buildSuggestion(
          suffixKey,
          "medium",
          "Shared suffix across the candidate keys.",
        ),
      ],
      notes: [
        "Candidate keys differ before the shared suffix, so review that they represent the same business concept.",
      ],
    };
  }

  if (isClientNameKey(suffixKey)) {
    return suggestClientNameCanonical(
      entries,
      entries.map((entry) => stripFormSpecificPrefixes(entry.fieldKey)),
    );
  }

  const hasFormPrefixes = entries.some(
    (entry) => entry.formSpecificPrefixes.length > 0,
  );

  return {
    primary: buildSuggestion(
      suffixKey,
      "medium",
      "Candidate keys share a trailing token pattern after removing form-specific prefixes.",
    ),
    alternatives: [],
    notes: hasFormPrefixes
      ? [
          "Review the differing prefixes before merging. Avoid carrying form-specific prefixes into the canonical name.",
        ]
      : [],
  };
}

export function suggestCanonicalFieldNames(
  entries: CanonicalNameSuggestionInput[],
): FieldMergeCanonicalNameAdvice {
  if (entries.length === 0) {
    return {
      primary: null,
      alternatives: [],
      notes: [],
    };
  }

  const strippedKeys = entries.map((entry) =>
    stripFormSpecificPrefixes(entry.fieldKey),
  );
  const uniqueStripped = [...new Set(strippedKeys.filter(Boolean))];

  if (uniqueStripped.length === 1) {
    return suggestFromSharedStrippedKey(uniqueStripped[0], entries);
  }

  const strippedTokenLists = strippedKeys
    .filter(Boolean)
    .map((key) => tokenizeFieldKey(key));
  const commonSuffix = longestCommonTokenSuffix(strippedTokenLists);

  if (commonSuffix.length >= 2) {
    return suggestFromCommonSuffix(commonSuffix, entries);
  }

  const normalizedKeys = entries.map((entry) => normalizeKey(entry.fieldKey));
  const existingWithoutPrefixes = normalizedKeys.find(
    (key) => detectFormSpecificPrefixes(key).length === 0,
  );

  if (existingWithoutPrefixes) {
    return {
      primary: buildSuggestion(
        existingWithoutPrefixes,
        "medium",
        "One candidate already uses a reusable key without form-specific prefixes.",
      ),
      alternatives: uniqueStripped.map((strippedKey) =>
        buildSuggestion(
          strippedKey,
          "low",
          "Stripped key from a form-specific candidate.",
        ),
      ),
      notes: [
        "Prefer an existing reusable key when one is already present in the group.",
      ],
    };
  }

  if (uniqueStripped.length > 1) {
    return {
      primary: null,
      alternatives: uniqueStripped.map((strippedKey) =>
        buildSuggestion(
          strippedKey,
          "low",
          "Possible stripped key from one of the candidates.",
        ),
      ),
      notes: [
        "Candidate keys do not share a single stripped name. Review whether these fields represent the same business concept before merging.",
      ],
    };
  }

  return {
    primary: null,
    alternatives: [],
    notes: [
      "No reusable canonical name could be inferred. Review the candidate fields manually.",
    ],
  };
}

export function formatCanonicalNameAdvice(
  advice: FieldMergeCanonicalNameAdvice,
): string {
  if (advice.primary) {
    return advice.primary.fieldKey;
  }

  if (advice.alternatives.length > 0) {
    return advice.alternatives.map((suggestion) => suggestion.fieldKey).join(" | ");
  }

  return "—";
}
