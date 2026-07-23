import {
  EXCLUDED_FORM_PDF_PATH_MARKERS,
  FORM_TEMPLATES_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  YAHOO_AUTH_UUID,
} from "./constants.ts";
import type { ProductionSelectionManifest } from "./manifest.ts";
import { SelectiveMigrationSafetyError } from "./safety.ts";

export type StorageAllowlistEntry = {
  bucket: string;
  path: string;
  size?: number | string | null;
  checksum?: string | null;
  status?: string;
  associatedObject?: string | null;
  inclusionReason: string;
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

export function isExcludedStoragePath(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (EXCLUDED_FORM_PDF_PATH_MARKERS.some((m) => p.includes(m.replace(/\/$/, "")) || p.startsWith(m) || p.includes(m))) {
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

export function verifyChecksumsMatch(options: {
  sourceChecksum: string | null | undefined;
  targetChecksum: string | null | undefined;
  path: string;
}): void {
  if (!options.sourceChecksum || !options.targetChecksum) {
    throw new SelectiveMigrationSafetyError(
      `Missing checksum for storage object ${options.path}`,
    );
  }
  const a = options.sourceChecksum.replace(/^"|"$/g, "");
  const b = options.targetChecksum.replace(/^"|"$/g, "");
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
