import {
  APPROVED_FORM_IDS,
  EXCLUDED_FORM_PDF_PATH_MARKERS,
  FORM_TEMPLATES_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  YAHOO_AUTH_UUID,
} from "./constants.ts";
import type { ProductionSelectionManifest } from "./manifest.ts";
import { SelectiveMigrationSafetyError } from "./safety.ts";

export const EXPECTED_STORAGE_OBJECT_COUNT = 30;
export const EXPECTED_FORM_TEMPLATE_COUNT = 18;
export const EXPECTED_GENERATED_DOCUMENT_COUNT = 12;

export type StorageAllowlistEntry = {
  bucket: string;
  path: string;
  size?: number | string | null;
  checksum?: string | null;
  status?: string;
  associatedObject?: string | null;
  inclusionReason: string;
};

export type StorageObjectMeta = {
  bucket: string;
  path: string;
  size: number | null;
  checksum: string | null;
};

export type StorageCopyPlanBuckets = {
  upload: StorageAllowlistEntry[];
  skipIdentical: StorageAllowlistEntry[];
  conflictDifferentChecksum: Array<{
    entry: StorageAllowlistEntry;
    target: StorageObjectMeta;
  }>;
  missingSourceExpected: StorageAllowlistEntry[];
};

export function buildStorageAllowlist(
  manifest: ProductionSelectionManifest,
): StorageAllowlistEntry[] {
  return (manifest.storageObjects || [])
    .filter((s) => s.migrationAction !== "exclude")
    .map((s) => ({
      bucket: String(s.bucket || FORM_TEMPLATES_BUCKET),
      path: String(s.path || s.description),
      size: (s.size as number | string | null | undefined) ?? null,
      checksum: (s.checksum as string | null | undefined) ?? null,
      status: (s.status as string | undefined) ?? "ACTIVE",
      associatedObject: (s.associatedDatabaseObject as string | null) ?? null,
      inclusionReason: String(s.inclusionReason || "approved"),
    }));
}

/** Strip surrounding quotes/whitespace from Supabase/S3-style MD5 etags. */
export function normalizeStorageChecksum(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  let out = String(value).trim();
  while (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out.length > 0 ? out : null;
}

export function parseStorageSize(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function isExcludedStoragePath(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (
    EXCLUDED_FORM_PDF_PATH_MARKERS.some(
      (m) =>
        p.includes(m.replace(/\/$/, "")) || p.startsWith(m) || p.includes(m),
    )
  ) {
    return true;
  }
  if (p.includes(`users/${YAHOO_AUTH_UUID}/`)) return true;
  // Non-approved packet paths
  const packetMatch = p.match(/\/packets\/(\d+)\//);
  if (packetMatch) {
    const packetId = Number(packetMatch[1]);
    if (packetId !== 2 && packetId !== 5) return true;
  }
  return false;
}

export function assertStoragePathAllowed(
  bucket: string,
  path: string,
  allowlist: StorageAllowlistEntry[],
): void {
  if (bucket !== FORM_TEMPLATES_BUCKET && bucket !== GENERATED_DOCUMENTS_BUCKET) {
    throw new SelectiveMigrationSafetyError(`Bucket ${bucket} is not approved for copy.`);
  }
  if (isExcludedStoragePath(path)) {
    throw new SelectiveMigrationSafetyError(`Storage path excluded: ${path}`);
  }
  const ok = allowlist.some((e) => e.bucket === bucket && e.path === path);
  if (!ok) {
    throw new SelectiveMigrationSafetyError(
      `Storage path not on allowlist (bucket-wide copy forbidden): ${bucket}/${path}`,
    );
  }
}

/**
 * Assert allowlist is exactly 30 objects: 18 form-templates (forms 1–18) +
 * 12 generated-documents (packets 2/5 only). No duplicates or excluded paths.
 */
export function assertAllowlistExactShape(
  allowlist: StorageAllowlistEntry[],
): {
  total: number;
  formTemplates: number;
  generatedDocuments: number;
  proofs: {
    noForms21to23: boolean;
    onlyPackets2and5: boolean;
    noDuplicates: boolean;
    forms1to18Only: boolean;
  };
} {
  const formTemplates = allowlist.filter((e) => e.bucket === FORM_TEMPLATES_BUCKET);
  const generated = allowlist.filter((e) => e.bucket === GENERATED_DOCUMENTS_BUCKET);

  if (allowlist.length !== EXPECTED_STORAGE_OBJECT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Allowlist must have exactly ${EXPECTED_STORAGE_OBJECT_COUNT} objects (got ${allowlist.length}).`,
    );
  }
  if (formTemplates.length !== EXPECTED_FORM_TEMPLATE_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Allowlist must have ${EXPECTED_FORM_TEMPLATE_COUNT} form-templates (got ${formTemplates.length}).`,
    );
  }
  if (generated.length !== EXPECTED_GENERATED_DOCUMENT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Allowlist must have ${EXPECTED_GENERATED_DOCUMENT_COUNT} generated-documents (got ${generated.length}).`,
    );
  }

  const keys = new Set<string>();
  for (const entry of allowlist) {
    const key = `${entry.bucket}:${entry.path}`;
    if (keys.has(key)) {
      throw new SelectiveMigrationSafetyError(`Duplicate allowlist entry: ${key}`);
    }
    keys.add(key);

    if (
      entry.bucket !== FORM_TEMPLATES_BUCKET &&
      entry.bucket !== GENERATED_DOCUMENTS_BUCKET
    ) {
      throw new SelectiveMigrationSafetyError(
        `Unexpected bucket on allowlist: ${entry.bucket}`,
      );
    }
    if (isExcludedStoragePath(entry.path)) {
      throw new SelectiveMigrationSafetyError(
        `Allowlist contains excluded path: ${entry.path}`,
      );
    }

    if (entry.bucket === FORM_TEMPLATES_BUCKET) {
      const m = entry.path.match(/^global\/forms\/(\d+)\//);
      if (!m) {
        throw new SelectiveMigrationSafetyError(
          `form-templates path must be global/forms/{id}/…: ${entry.path}`,
        );
      }
      const formId = Number(m[1]);
      if (!(APPROVED_FORM_IDS as readonly number[]).includes(formId)) {
        throw new SelectiveMigrationSafetyError(
          `form-templates path must be forms 1–18 only: ${entry.path}`,
        );
      }
    }

    if (entry.bucket === GENERATED_DOCUMENTS_BUCKET) {
      const packetMatch = entry.path.match(/\/packets\/(\d+)\//);
      if (!packetMatch) {
        throw new SelectiveMigrationSafetyError(
          `generated-documents path must include /packets/{id}/: ${entry.path}`,
        );
      }
      const packetId = Number(packetMatch[1]);
      if (packetId !== 2 && packetId !== 5) {
        throw new SelectiveMigrationSafetyError(
          `generated-documents path must be packets 2 or 5 only: ${entry.path}`,
        );
      }
    }
  }

  const formIds = new Set(
    formTemplates.map((e) => {
      const m = e.path.match(/^global\/forms\/(\d+)\//);
      return m ? Number(m[1]) : -1;
    }),
  );
  for (const id of APPROVED_FORM_IDS) {
    if (!formIds.has(id)) {
      throw new SelectiveMigrationSafetyError(
        `Missing form-templates PDF for form ${id}.`,
      );
    }
  }

  return {
    total: allowlist.length,
    formTemplates: formTemplates.length,
    generatedDocuments: generated.length,
    proofs: {
      noForms21to23: true,
      onlyPackets2and5: true,
      noDuplicates: true,
      forms1to18Only: true,
    },
  };
}

export function verifyChecksumsMatch(options: {
  sourceChecksum: string | null | undefined;
  targetChecksum: string | null | undefined;
  path: string;
}): void {
  const a = normalizeStorageChecksum(options.sourceChecksum);
  const b = normalizeStorageChecksum(options.targetChecksum);
  if (!a || !b) {
    throw new SelectiveMigrationSafetyError(
      `Missing checksum for storage object ${options.path}`,
    );
  }
  if (a !== b) {
    throw new SelectiveMigrationSafetyError(
      `Checksum mismatch for ${options.path}: source=${a} target=${b}`,
    );
  }
}

export function storageCopyPlan(allowlist: StorageAllowlistEntry[]): {
  formTemplates: number;
  generatedDocuments: number;
  excludedMarkers: readonly string[];
} {
  return {
    formTemplates: allowlist.filter((e) => e.bucket === FORM_TEMPLATES_BUCKET).length,
    generatedDocuments: allowlist.filter((e) => e.bucket === GENERATED_DOCUMENTS_BUCKET)
      .length,
    excludedMarkers: EXCLUDED_FORM_PDF_PATH_MARKERS,
  };
}

function metaKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

function checksumsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeStorageChecksum(a);
  const nb = normalizeStorageChecksum(b);
  return na != null && nb != null && na === nb;
}

function sizesEqual(
  a: number | string | null | undefined,
  b: number | null | undefined,
): boolean {
  const na = parseStorageSize(a);
  const nb = parseStorageSize(b);
  return na != null && nb != null && na === nb;
}

/**
 * Compare allowlist to target (and optional source) object metadata.
 * Pure planning helper — does not perform I/O.
 */
export function planStorageCopy(options: {
  allowlist: StorageAllowlistEntry[];
  targetObjects: StorageObjectMeta[];
  sourceObjects?: StorageObjectMeta[];
}): StorageCopyPlanBuckets {
  const targetByKey = new Map(
    options.targetObjects.map((o) => [metaKey(o.bucket, o.path), o]),
  );
  const sourceByKey = options.sourceObjects
    ? new Map(options.sourceObjects.map((o) => [metaKey(o.bucket, o.path), o]))
    : null;

  const upload: StorageAllowlistEntry[] = [];
  const skipIdentical: StorageAllowlistEntry[] = [];
  const conflictDifferentChecksum: StorageCopyPlanBuckets["conflictDifferentChecksum"] =
    [];
  const missingSourceExpected: StorageAllowlistEntry[] = [];

  for (const entry of options.allowlist) {
    const key = metaKey(entry.bucket, entry.path);
    if (sourceByKey && !sourceByKey.has(key)) {
      missingSourceExpected.push(entry);
    }

    const target = targetByKey.get(key);
    if (!target) {
      upload.push(entry);
      continue;
    }

    const sameChecksum = checksumsEqual(entry.checksum, target.checksum);
    const sameSize =
      entry.size == null ||
      target.size == null ||
      sizesEqual(entry.size, target.size);

    if (sameChecksum && sameSize) {
      skipIdentical.push(entry);
      continue;
    }

    if (
      target.checksum != null &&
      entry.checksum != null &&
      !sameChecksum
    ) {
      conflictDifferentChecksum.push({ entry, target });
      continue;
    }

    // Target exists but size/checksum incomplete or size differs → re-upload
    upload.push(entry);
  }

  return {
    upload,
    skipIdentical,
    conflictDifferentChecksum,
    missingSourceExpected,
  };
}
