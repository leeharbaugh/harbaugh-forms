import { fillPacketFormPdfBytes } from "@/lib/fill-packet-form-pdf";
import { loadPacketFormEditorData } from "@/lib/packet-form-editor";
import { sanitizePdfFileName } from "@/lib/form-storage";
import {
  buildSortablePacketFormFileName,
  sanitizeHumanPdfFileName,
} from "@/lib/packet-form-download-names";
import {
  GENERATED_DOCUMENTS_BUCKET,
  createPacketFormDownloadUrl,
  triggerBrowserDownload,
} from "@/lib/packet-form-storage";
import type { PacketFormFieldView } from "@/lib/types/packet-form-editor";
import type { PacketForm } from "@/lib/types/packet";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PacketFormDownloadTarget = Pick<
  PacketForm,
  "id" | "packet_id" | "form_id" | "document_name" | "storage_path"
>;

export type DownloadAllProgress = {
  completed: number;
  total: number;
  currentDocumentName: string | null;
};

export type DownloadAllPacketFormsResult = {
  savedCount: number;
  skippedCount: number;
  skipped: Array<{ documentName: string; fileName: string }>;
  failed: Array<{ documentName: string; error: string }>;
  usedDirectoryPicker: boolean;
  cancelled?: boolean;
  fallbackNotice?: string;
};

const FALLBACK_DOWNLOAD_DELAY_MS = 400;

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function downloadStoragePdfBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .download(storagePath.trim());

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download packet form PDF.");
  }

  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
}

function triggerFilledPdfDownload(
  bytes: Uint8Array,
  documentName: string,
  options?: { humanReadableFileName?: boolean },
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const fileName = options?.humanReadableFileName
    ? sanitizeHumanPdfFileName(documentName)
    : sanitizePdfFileName(documentName);

  try {
    triggerBrowserDownload(objectUrl, fileName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Load a packet form PDF with field values written in (or unchanged for external uploads).
 */
export async function getFilledPacketFormPdfBytes(
  supabase: SupabaseClient,
  document: PacketFormDownloadTarget,
  options?: {
    fields?: PacketFormFieldView[];
  },
): Promise<Uint8Array> {
  if (!document.storage_path?.trim()) {
    throw new Error("This document does not have a stored PDF yet.");
  }

  if (document.form_id == null) {
    return downloadStoragePdfBytes(supabase, document.storage_path);
  }

  const sourceBytesPromise = downloadStoragePdfBytes(
    supabase,
    document.storage_path,
  );

  let fields = options?.fields;
  if (!fields) {
    const editorData = await loadPacketFormEditorData(supabase, document.id);
    if (editorData.packetForm.packet_id !== document.packet_id) {
      throw new Error("Packet form does not belong to this packet.");
    }
    fields = editorData.fields;
  }

  const sourceBytes = await sourceBytesPromise;
  return fillPacketFormPdfBytes(sourceBytes, fields);
}

/**
 * Download a packet form PDF with field values written into the file.
 * External uploads (no linked template form) download the stored PDF unchanged.
 */
export async function downloadFilledPacketFormPdf(
  supabase: SupabaseClient,
  document: PacketFormDownloadTarget,
  options?: {
    /** When provided (e.g. from the live editor), uses on-screen values including unsaved drafts. */
    fields?: PacketFormFieldView[];
    /** Override the browser download filename. */
    fileName?: string;
  },
): Promise<void> {
  if (!document.storage_path?.trim()) {
    throw new Error("This document does not have a stored PDF yet.");
  }

  if (document.form_id == null) {
    const url = await createPacketFormDownloadUrl(
      supabase,
      document.storage_path,
    );
    triggerBrowserDownload(
      url,
      options?.fileName
        ? sanitizeHumanPdfFileName(options.fileName)
        : document.document_name,
    );
    return;
  }

  const filledBytes = await getFilledPacketFormPdfBytes(supabase, document, {
    fields: options?.fields,
  });

  triggerFilledPdfDownload(
    filledBytes,
    options?.fileName ?? document.document_name,
    { humanReadableFileName: options?.fileName != null },
  );
}

async function directoryContainsFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function writePdfToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  bytes: Uint8Array,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
  );
  await writable.close();
}

/**
 * Save or download every filled packet form as a separate PDF.
 * Uses showDirectoryPicker when available; otherwise falls back to individual downloads.
 */
export async function downloadAllFilledPacketForms(
  supabase: SupabaseClient,
  documents: PacketFormDownloadTarget[],
  options?: {
    contactNames?: string | null;
    onProgress?: (progress: DownloadAllProgress) => void;
    /** Called when a target filename already exists in the selected folder. */
    onDuplicateFile?: (duplicate: {
      fileName: string;
      documentName: string;
    }) => Promise<boolean>;
  },
): Promise<DownloadAllPacketFormsResult> {
  const downloadable = documents.filter((document) => document.storage_path);
  const failed: DownloadAllPacketFormsResult["failed"] = [];
  const skipped: DownloadAllPacketFormsResult["skipped"] = [];
  let savedCount = 0;
  const total = downloadable.length;

  const reportProgress = (
    completed: number,
    currentDocumentName: string | null,
  ) => {
    options?.onProgress?.({
      completed,
      total,
      currentDocumentName,
    });
  };

  if (downloadable.length === 0) {
    throw new Error("No copied PDFs are available to download.");
  }

  reportProgress(0, null);

  if (supportsDirectoryPicker()) {
    let directoryHandle: FileSystemDirectoryHandle;

    try {
      directoryHandle = await (
        window as unknown as {
          showDirectoryPicker: (options?: {
            mode?: "read" | "readwrite";
          }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({
        mode: "readwrite",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          savedCount: 0,
          skippedCount: 0,
          skipped: [],
          failed: [],
          usedDirectoryPicker: true,
          cancelled: true,
        };
      }

      throw error;
    }

    for (const [index, document] of downloadable.entries()) {
      reportProgress(index, document.document_name);

      const fileName = buildSortablePacketFormFileName(
        index,
        document.document_name,
        options?.contactNames,
      );

      try {
        const fileExists = await directoryContainsFile(
          directoryHandle,
          fileName,
        );

        if (fileExists) {
          const shouldOverwrite = options?.onDuplicateFile
            ? await options.onDuplicateFile({
                fileName,
                documentName: document.document_name,
              })
            : false;

          if (!shouldOverwrite) {
            skipped.push({
              documentName: document.document_name,
              fileName,
            });
            reportProgress(index + 1, document.document_name);
            continue;
          }
        }

        const bytes = await getFilledPacketFormPdfBytes(supabase, document);
        await writePdfToDirectory(directoryHandle, fileName, bytes);
        savedCount += 1;
      } catch (error) {
        failed.push({
          documentName: document.document_name,
          error:
            error instanceof Error ? error.message : "Failed to save PDF.",
        });
      }

      reportProgress(index + 1, document.document_name);
    }

    return {
      savedCount,
      skippedCount: skipped.length,
      skipped,
      failed,
      usedDirectoryPicker: true,
    };
  }

  const fallbackNotice =
    "This browser does not support choosing a save folder from the app. Each form will download individually using your browser's normal download behavior.";

  for (const [index, document] of downloadable.entries()) {
    reportProgress(index, document.document_name);

    const fileName = buildSortablePacketFormFileName(
      index,
      document.document_name,
      options?.contactNames,
    );

    try {
      await downloadFilledPacketFormPdf(supabase, document, { fileName });
      savedCount += 1;
    } catch (error) {
      failed.push({
        documentName: document.document_name,
        error:
          error instanceof Error ? error.message : "Failed to download PDF.",
      });
    }

    reportProgress(index + 1, document.document_name);

    if (index < downloadable.length - 1) {
      await sleep(FALLBACK_DOWNLOAD_DELAY_MS);
    }
  }

  return {
    savedCount,
    skippedCount: 0,
    skipped: [],
    failed,
    usedDirectoryPicker: false,
    fallbackNotice,
  };
}
