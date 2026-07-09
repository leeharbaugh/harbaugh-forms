export type SourcePathDropdownOption = {
  value: string;
  label: string;
};

type DedupeSourcePathOptionsParams = {
  canonicalize?: (value: string) => string;
  preferValue?: (values: string[], canonicalValue: string) => string;
};

function disambiguateDuplicateLabels(
  options: SourcePathDropdownOption[],
): SourcePathDropdownOption[] {
  const byLabel = new Map<string, SourcePathDropdownOption[]>();

  for (const option of options) {
    const bucket = byLabel.get(option.label) ?? [];
    bucket.push(option);
    byLabel.set(option.label, bucket);
  }

  return options.map((option) => {
    const matches = byLabel.get(option.label) ?? [option];
    if (matches.length <= 1) {
      return option;
    }

    return {
      ...option,
      label: `${option.label} (${option.value})`,
    };
  });
}

/** Remove dropdown entries that resolve to the same canonical source path. */
export function dedupeSourcePathOptions(
  options: SourcePathDropdownOption[],
  params?: DedupeSourcePathOptionsParams,
): SourcePathDropdownOption[] {
  const canonicalize =
    params?.canonicalize ?? ((value: string) => value.trim().toLowerCase());

  const groups = new Map<string, SourcePathDropdownOption[]>();
  for (const option of options) {
    const key = canonicalize(option.value);
    const bucket = groups.get(key) ?? [];
    bucket.push(option);
    groups.set(key, bucket);
  }

  const deduped: SourcePathDropdownOption[] = [];
  for (const [canonicalValue, group] of groups) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    const preferredValue =
      params?.preferValue?.(
        group.map((option) => option.value),
        canonicalValue,
      ) ?? group[0].value;

    const winner =
      group.find((option) => option.value === preferredValue) ?? group[0];
    deduped.push(winner);
  }

  return disambiguateDuplicateLabels(deduped);
}
