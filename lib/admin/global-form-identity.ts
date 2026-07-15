/**
 * Unique Global form identity under
 * (lower(form_code), coalesce(version_label, '')) for ACTIVE GLOBAL forms.
 * Display names follow "Name - Copy" / "Name - Copy N".
 */

export type GlobalFormIdentitySeed = {
  form_name: string;
  form_code: string;
  version_label: string | null;
};

export type ExistingGlobalIdentity = {
  form_code: string;
  version_label: string | null;
};

function identityKey(code: string, version: string | null | undefined): string {
  return `${code.trim().toLowerCase()}|${(version ?? "").trim().toLowerCase()}`;
}

export function nextUniqueGlobalFormIdentity(
  source: GlobalFormIdentitySeed,
  existingActiveGlobal: ExistingGlobalIdentity[],
): GlobalFormIdentitySeed {
  const existing = new Set(
    existingActiveGlobal.map((row) =>
      identityKey(row.form_code, row.version_label),
    ),
  );

  const version = source.version_label?.trim() || null;
  const baseName = source.form_name.trim() || "Form";
  const baseCode = source.form_code.trim() || "FORM";

  if (!existing.has(identityKey(baseCode, version))) {
    return {
      form_name: baseName,
      form_code: baseCode.slice(0, 50),
      version_label: version,
    };
  }

  let n = 1;
  while (true) {
    const suffix = n === 1 ? " - Copy" : ` - Copy ${n}`;
    const name = `${baseName}${suffix}`.slice(0, 200);
    const codeSuffix = n === 1 ? "-COPY" : `-COPY${n}`;
    const code = `${baseCode}${codeSuffix}`.slice(0, 50);
    if (!existing.has(identityKey(code, version))) {
      return {
        form_name: name,
        form_code: code,
        version_label: version,
      };
    }
    n += 1;
  }
}
