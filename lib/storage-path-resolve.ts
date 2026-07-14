import {
  FORM_TEMPLATES_BUCKET,
  buildFormStoragePath,
  buildLegacyFormStoragePath,
  extractPdfFileNameFromStoragePath,
  isLegacyFormStoragePath,
  isNewFormStoragePath,
  type FormLibraryScope,
} from "@/lib/form-storage";
import {
  GENERATED_DOCUMENTS_BUCKET,
  buildLegacyPacketFormStoragePath,
  buildPacketFormStoragePath,
  isLegacyPacketStoragePath,
  isNewPacketStoragePath,
} from "@/lib/packet-form-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StorageEntityType = "FORM" | "PACKET_FORM";

export type ResolvedStoragePath = {
  bucket: string;
  entityType: StorageEntityType;
  entityId: number;
  primaryPath: string;
  attemptedPaths: string[];
  resolvedPath: string;
  usedFallback: boolean;
};

async function objectExists(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }

  const parent = trimmed.includes("/")
    ? trimmed.slice(0, trimmed.lastIndexOf("/"))
    : "";
  const name = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;

  const { data, error } = await supabase.storage.from(bucket).list(parent, {
    search: name,
    limit: 100,
  });

  if (error) {
    throw new Error(
      `[storage-resolve] Failed listing ${bucket}/${parent}: ${error.message}`,
    );
  }

  return (data ?? []).some((entry) => entry.name === name);
}

function deterministicFormFallbackPath(options: {
  currentPath: string;
  formId: number;
  formCode?: string | null;
  scope?: FormLibraryScope | null;
  ownerUserId?: string | null;
}): string | null {
  const fileName = extractPdfFileNameFromStoragePath(options.currentPath);
  const scope = options.scope ?? "GLOBAL";

  if (isLegacyFormStoragePath(options.currentPath)) {
    try {
      return buildFormStoragePath({
        scope,
        formId: options.formId,
        fileName,
        ownerUserId: options.ownerUserId,
      });
    } catch {
      return null;
    }
  }

  if (isNewFormStoragePath(options.currentPath) && options.formCode?.trim()) {
    try {
      return buildLegacyFormStoragePath(options.formCode, fileName);
    } catch {
      return null;
    }
  }

  return null;
}

function deterministicPacketFallbackPath(options: {
  currentPath: string;
  ownerUserId?: string | null;
  packetId: number;
  packetFormId: number;
  formId?: number | null;
  documentName?: string | null;
}): string | null {
  const documentName =
    options.documentName?.trim() ||
    extractPdfFileNameFromStoragePath(options.currentPath);

  if (isLegacyPacketStoragePath(options.currentPath) && options.ownerUserId) {
    try {
      return buildPacketFormStoragePath({
        ownerUserId: options.ownerUserId,
        packetId: options.packetId,
        packetFormId: options.packetFormId,
        documentName,
      });
    } catch {
      return null;
    }
  }

  if (
    isNewPacketStoragePath(options.currentPath) &&
    options.formId &&
    options.formId > 0
  ) {
    try {
      return buildLegacyPacketFormStoragePath(
        options.packetId,
        options.formId,
        documentName,
      );
    } catch {
      return null;
    }
  }

  return null;
}

async function resolvePathWithFallbacks(
  supabase: SupabaseClient,
  options: {
    bucket: string;
    entityType: StorageEntityType;
    entityId: number;
    primaryPath: string;
    candidates: Array<string | null | undefined>;
  },
): Promise<ResolvedStoragePath> {
  const primaryPath = options.primaryPath.trim();
  if (!primaryPath) {
    throw new Error(
      `[storage-resolve] Missing primary path for ${options.entityType} ${options.entityId}`,
    );
  }

  const attemptedPaths: string[] = [];
  const uniqueCandidates = [primaryPath, ...options.candidates]
    .map((path) => path?.trim() ?? "")
    .filter(Boolean)
    .filter((path, index, all) => all.indexOf(path) === index);

  for (const candidate of uniqueCandidates) {
    attemptedPaths.push(candidate);
    const exists = await objectExists(supabase, options.bucket, candidate);
    if (exists) {
      return {
        bucket: options.bucket,
        entityType: options.entityType,
        entityId: options.entityId,
        primaryPath,
        attemptedPaths,
        resolvedPath: candidate,
        usedFallback: candidate !== primaryPath,
      };
    }
  }

  console.error("[storage-resolve] Object not found", {
    bucket: options.bucket,
    entityType: options.entityType,
    entityId: options.entityId,
    attemptedPaths,
  });

  throw new Error(
    `[storage-resolve] No Storage object found for ${options.entityType} ${options.entityId} in ${options.bucket}. Tried: ${attemptedPaths.join(", ")}`,
  );
}

export async function resolveFormStoragePath(
  supabase: SupabaseClient,
  options: {
    formId: number;
    path: string;
    formCode?: string | null;
    scope?: FormLibraryScope | null;
    ownerUserId?: string | null;
  },
): Promise<ResolvedStoragePath> {
  const primaryPath = options.path.trim();
  // Phase C: do not query storage_path_migrations from the browser.
  // Fallback is deterministic only (new ↔ legacy path shapes).
  const deterministic = deterministicFormFallbackPath({
    currentPath: primaryPath,
    formId: options.formId,
    formCode: options.formCode,
    scope: options.scope,
    ownerUserId: options.ownerUserId,
  });

  return resolvePathWithFallbacks(supabase, {
    bucket: FORM_TEMPLATES_BUCKET,
    entityType: "FORM",
    entityId: options.formId,
    primaryPath,
    candidates: [deterministic],
  });
}

export async function resolvePacketFormStoragePath(
  supabase: SupabaseClient,
  options: {
    packetFormId: number;
    packetId: number;
    path: string;
    ownerUserId?: string | null;
    formId?: number | null;
    documentName?: string | null;
  },
): Promise<ResolvedStoragePath> {
  const primaryPath = options.path.trim();
  const deterministic = deterministicPacketFallbackPath({
    currentPath: primaryPath,
    ownerUserId: options.ownerUserId,
    packetId: options.packetId,
    packetFormId: options.packetFormId,
    formId: options.formId,
    documentName: options.documentName,
  });

  return resolvePathWithFallbacks(supabase, {
    bucket: GENERATED_DOCUMENTS_BUCKET,
    entityType: "PACKET_FORM",
    entityId: options.packetFormId,
    primaryPath,
    candidates: [deterministic],
  });
}

export async function createFormSignedUrlWithFallback(
  supabase: SupabaseClient,
  options: {
    formId: number;
    path: string;
    formCode?: string | null;
    scope?: FormLibraryScope | null;
    ownerUserId?: string | null;
    expiresInSeconds?: number;
  },
): Promise<{ signedUrl: string; resolved: ResolvedStoragePath }> {
  const resolved = await resolveFormStoragePath(supabase, options);
  const { data, error } = await supabase.storage
    .from(FORM_TEMPLATES_BUCKET)
    .createSignedUrl(resolved.resolvedPath, options.expiresInSeconds ?? 60 * 60);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ??
        `[storage-resolve] Failed signed URL for FORM ${options.formId}`,
    );
  }

  return { signedUrl: data.signedUrl, resolved };
}

export async function createPacketFormSignedUrlWithFallback(
  supabase: SupabaseClient,
  options: {
    packetFormId: number;
    packetId: number;
    path: string;
    ownerUserId?: string | null;
    formId?: number | null;
    documentName?: string | null;
    expiresInSeconds?: number;
  },
): Promise<{ signedUrl: string; resolved: ResolvedStoragePath }> {
  const resolved = await resolvePacketFormStoragePath(supabase, options);
  const { data, error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .createSignedUrl(resolved.resolvedPath, options.expiresInSeconds ?? 60);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ??
        `[storage-resolve] Failed signed URL for PACKET_FORM ${options.packetFormId}`,
    );
  }

  return { signedUrl: data.signedUrl, resolved };
}

export async function downloadStorageBytesWithFallback(
  supabase: SupabaseClient,
  options:
    | {
        bucket: typeof FORM_TEMPLATES_BUCKET;
        entityType: "FORM";
        entityId: number;
        path: string;
        formCode?: string | null;
        scope?: FormLibraryScope | null;
        ownerUserId?: string | null;
      }
    | {
        bucket: typeof GENERATED_DOCUMENTS_BUCKET;
        entityType: "PACKET_FORM";
        entityId: number;
        packetId: number;
        path: string;
        ownerUserId?: string | null;
        formId?: number | null;
        documentName?: string | null;
      },
): Promise<{ bytes: Uint8Array; resolved: ResolvedStoragePath }> {
  const resolved =
    options.entityType === "FORM"
      ? await resolveFormStoragePath(supabase, {
          formId: options.entityId,
          path: options.path,
          formCode: options.formCode,
          scope: options.scope,
          ownerUserId: options.ownerUserId,
        })
      : await resolvePacketFormStoragePath(supabase, {
          packetFormId: options.entityId,
          packetId: options.packetId,
          path: options.path,
          ownerUserId: options.ownerUserId,
          formId: options.formId,
          documentName: options.documentName,
        });

  const { data, error } = await supabase.storage
    .from(options.bucket)
    .download(resolved.resolvedPath);

  if (error || !data) {
    throw new Error(
      error?.message ??
        `[storage-resolve] Download failed for ${options.entityType} ${options.entityId}`,
    );
  }

  const buffer = await data.arrayBuffer();
  return { bytes: new Uint8Array(buffer), resolved };
}
