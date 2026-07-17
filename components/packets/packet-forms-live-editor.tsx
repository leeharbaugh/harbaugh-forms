"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadFilledPacketFormPdf } from "@/lib/packet-form-download";
import { createClient } from "@/lib/supabase/client";
import type { Form } from "@/lib/types/form";
import {
  addExternalFormToPacket,
  addInternalFormToPacket,
  formatPacketFormOrigin,
  getNextPacketFormSortOrder,
  reorderPacketForm,
  softDeletePacketForm,
  sortPacketForms,
  validateAdditionalInternalFormId,
  warnDuplicateExternalDocumentName,
} from "@/lib/types/packet-form";
import type { PacketForm } from "@/lib/types/packet";
import {
  formatPacketFormDocumentState,
  packetFormDocumentStateVariant,
} from "@/lib/types/packet-form-lifecycle";
import { formatFormCategory, formatFormReference } from "@/lib/types/form";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PacketFormsLiveEditorProps = {
  packetId: number;
  forms: PacketForm[];
  collectionFormIds: number[];
  disabled?: boolean;
  onFormsChange: () => void;
};

export function PacketFormsLiveEditor({
  packetId,
  forms,
  collectionFormIds,
  disabled = false,
  onFormsChange,
}: PacketFormsLiveEditorProps) {
  const activeForms = sortPacketForms(
    forms.filter((form) => form.status === "ACTIVE"),
  );
  const activeInternalFormIds = activeForms
    .filter((form) => form.form_id != null)
    .map((form) => form.form_id as number);

  const [formSearch, setFormSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Form[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddInternal, setShowAddInternal] = useState(false);
  const [showUploadExternal, setShowUploadExternal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingFormId, setDownloadingFormId] = useState<number | null>(
    null,
  );

  const [externalName, setExternalName] = useState("");
  const [externalNotes, setExternalNotes] = useState("");
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [formPendingRemove, setFormPendingRemove] =
    useState<PacketForm | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const searchForms = useCallback(async () => {
    const trimmed = formSearch.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const supabase = createClient();
    const term = `%${trimmed}%`;

    const { data, error } = await supabase
      .from("forms")
      .select("id, form_name, form_code, form_category, status")
      .eq("status", "ACTIVE")
      .or([`form_name.ilike.${term}`, `form_code.ilike.${term}`].join(","))
      .order("form_name", { ascending: true })
      .limit(10);

    if (error) {
      setSearchResults([]);
    } else {
      setSearchResults((data as Form[]) ?? []);
    }

    setIsSearching(false);
  }, [formSearch]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void searchForms();
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchForms]);

  const downloadDocument = async (document: PacketForm) => {
    setActionError(null);
    setDownloadingFormId(document.id);

    try {
      const supabase = createClient();
      await downloadFilledPacketFormPdf(supabase, document);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to download PDF.",
      );
    } finally {
      setDownloadingFormId(null);
    }
  };

  const handleAddInternalForm = async (formId: number) => {
    const validationError = validateAdditionalInternalFormId(
      formId,
      collectionFormIds,
      activeInternalFormIds,
    );
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionWarning(null);

    const supabase = createClient();

    try {
      const sortOrder = getNextPacketFormSortOrder(activeForms);
      await addInternalFormToPacket(supabase, packetId, formId, sortOrder);
      setShowAddInternal(false);
      setFormSearch("");
      setSearchResults([]);
      onFormsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to add form.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadExternal = async () => {
    setActionError(null);
    setActionWarning(null);

    const trimmedName = externalName.trim();
    if (!trimmedName || !externalFile) {
      setActionError("Document name and PDF file are required.");
      return;
    }

    const warning = warnDuplicateExternalDocumentName(
      trimmedName,
      activeForms.map((form) => form.document_name),
    );
    if (warning) {
      setActionWarning(warning);
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const sortOrder = getNextPacketFormSortOrder(activeForms);
      await addExternalFormToPacket(
        supabase,
        packetId,
        externalFile,
        trimmedName,
        sortOrder,
        externalNotes,
      );
      setShowUploadExternal(false);
      setExternalName("");
      setExternalNotes("");
      setExternalFile(null);
      onFormsChange();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to upload external document.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRemoveDialog = (document: PacketForm) => {
    setFormPendingRemove(document);
    setActionError(null);
  };

  const closeRemoveDialog = () => {
    if (isRemoving) {
      return;
    }
    setFormPendingRemove(null);
  };

  const handleConfirmRemoveForm = async () => {
    if (!formPendingRemove) {
      return;
    }

    setIsRemoving(true);
    setIsSubmitting(true);
    setActionError(null);

    const supabase = createClient();

    try {
      await softDeletePacketForm(supabase, formPendingRemove.id);
      setFormPendingRemove(null);
      onFormsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to remove form.",
      );
    } finally {
      setIsRemoving(false);
      setIsSubmitting(false);
    }
  };

  const handleReorder = async (packetFormId: number, direction: -1 | 1) => {
    setIsSubmitting(true);
    setActionError(null);

    const supabase = createClient();

    try {
      await reorderPacketForm(supabase, packetFormId, direction);
      onFormsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to reorder forms.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDeleteDialog
        open={formPendingRemove != null}
        objectType="packet form"
        title="Remove packet form?"
        itemName={formPendingRemove?.document_name}
        consequence="It will be removed from this packet and can be added again later."
        confirmLabel="Remove"
        confirmingLabel="Removing…"
        isConfirming={isRemoving}
        onConfirm={() => void handleConfirmRemoveForm()}
        onCancel={closeRemoveDialog}
      />
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowAddInternal((value) => !value);
              setShowUploadExternal(false);
              setActionError(null);
            }}
            disabled={isSubmitting}
          >
            Add form
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowUploadExternal((value) => !value);
              setShowAddInternal(false);
              setActionError(null);
            }}
            disabled={isSubmitting}
          >
            Upload external document
          </Button>
        </div>
      )}

      {showAddInternal && !disabled && (
        <div className="space-y-2 rounded-md border p-4">
          <Label htmlFor="live_form_search">Search internal forms</Label>
          <Input
            id="live_form_search"
            placeholder="Search by name or code..."
            value={formSearch}
            onChange={(event) => setFormSearch(event.target.value)}
            disabled={isSubmitting}
          />
          {formSearch.trim() && (
            <div className="rounded-md border">
              {isSearching ? (
                <p className="p-3 text-sm text-muted-foreground">
                  Searching...
                </p>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching forms found.
                </p>
              ) : (
                <div className="divide-y">
                  {searchResults.map((form) => {
                    const alreadyIncluded = activeInternalFormIds.includes(
                      form.id,
                    );
                    return (
                      <button
                        key={form.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void handleAddInternalForm(form.id)}
                        disabled={alreadyIncluded || isSubmitting}
                      >
                        <div>
                          <p className="font-medium">{form.form_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {form.form_code}
                          </p>
                        </div>
                        {alreadyIncluded && (
                          <span className="text-xs text-muted-foreground">
                            In packet
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showUploadExternal && !disabled && (
        <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="live_external_name">Document name *</Label>
            <Input
              id="live_external_name"
              value={externalName}
              onChange={(event) => setExternalName(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="live_external_file">PDF file *</Label>
            <Input
              id="live_external_file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) =>
                setExternalFile(event.target.files?.[0] ?? null)
              }
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="live_external_notes">Notes</Label>
            <Input
              id="live_external_notes"
              value={externalNotes}
              onChange={(event) => setExternalNotes(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              onClick={() => void handleUploadExternal()}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Uploading…" : "Upload to packet"}
            </Button>
          </div>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {actionWarning && (
        <p className="text-sm text-warning">
          {actionWarning}
        </p>
      )}

      {activeForms.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active forms in this packet.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {activeForms.map((document, index) => (
            <div
              key={document.id}
              className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {index + 1}. {document.document_name}
                  </p>
                  <Badge
                    variant={packetFormDocumentStateVariant(
                      document.document_state,
                    )}
                  >
                    {formatPacketFormDocumentState(document.document_state)}
                  </Badge>
                  <Badge variant="secondary">
                    {formatPacketFormOrigin(
                      document.origin ?? "collection",
                    )}
                  </Badge>
                  {document.is_required && (
                    <Badge variant="outline">Required</Badge>
                  )}
                </div>
                {document.forms ? (
                  <p className="text-muted-foreground">
                    {document.forms.form_name} ·{" "}
                    {formatFormReference(document.forms.id)} ·{" "}
                    {document.forms.form_code} ·{" "}
                    {formatFormCategory(document.forms.form_category)}
                  </p>
                ) : document.origin === "external_upload" ? (
                  <p className="text-muted-foreground">
                    External PDF
                    {document.notes ? ` · ${document.notes}` : ""}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {!disabled && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void handleReorder(document.id, -1)}
                      disabled={isSubmitting || index === 0}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void handleReorder(document.id, 1)}
                      disabled={
                        isSubmitting || index === activeForms.length - 1
                      }
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openRemoveDialog(document)}
                      disabled={
                        isSubmitting ||
                        ((document.origin ?? "collection") === "collection" &&
                          document.is_required)
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
                {document.form_id != null && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/packets/${packetId}/forms/${document.id}`}
                    >
                      Fill form
                    </Link>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadDocument(document)}
                  disabled={
                    !document.storage_path ||
                    downloadingFormId === document.id ||
                    isSubmitting
                  }
                >
                  {downloadingFormId === document.id
                    ? "Downloading..."
                    : "Download"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
