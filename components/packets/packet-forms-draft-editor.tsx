"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { CollectionFormLink } from "@/lib/types/collection";
import type { Form } from "@/lib/types/form";
import {
  formatPacketFormOrigin,
  getActiveCollectionFormLinks,
  type DraftExternalPacketForm,
  validateAdditionalInternalFormId,
  warnDuplicateExternalDocumentName,
} from "@/lib/types/packet-form";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PacketFormsDraftEditorProps = {
  collectionForms: CollectionFormLink[];
  additionalInternalFormIds: number[];
  onAdditionalInternalFormIdsChange: (formIds: number[]) => void;
  externalForms: DraftExternalPacketForm[];
  onExternalFormsChange: (forms: DraftExternalPacketForm[]) => void;
  disabled?: boolean;
};

type AddedInternalForm = Pick<Form, "id" | "form_name" | "form_code">;

export function PacketFormsDraftEditor({
  collectionForms,
  additionalInternalFormIds,
  onAdditionalInternalFormIdsChange,
  externalForms,
  onExternalFormsChange,
  disabled = false,
}: PacketFormsDraftEditorProps) {
  const collectionLinks = getActiveCollectionFormLinks(collectionForms);
  const collectionFormIds = collectionLinks.map((link) => link.form_id);

  const [formSearch, setFormSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Form[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedInternalForms, setAddedInternalForms] = useState<
    AddedInternalForm[]
  >([]);
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [externalName, setExternalName] = useState("");
  const [externalNotes, setExternalNotes] = useState("");
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [externalWarning, setExternalWarning] = useState<string | null>(null);
  const [externalError, setExternalError] = useState<string | null>(null);

  const allDocumentNames = useMemo(
    () => [
      ...collectionLinks.map(
        (link) => link.forms?.form_name ?? `Form #${link.form_id}`,
      ),
      ...addedInternalForms.map((form) => form.form_name),
      ...externalForms.map((form) => form.documentName),
    ],
    [collectionLinks, addedInternalForms, externalForms],
  );

  const loadAddedInternalForms = useCallback(async (formIds: number[]) => {
    if (formIds.length === 0) {
      setAddedInternalForms([]);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("forms")
      .select("id, form_name, form_code")
      .eq("status", "ACTIVE")
      .in("id", formIds);

    if (error) {
      setAddedInternalForms([]);
      return;
    }

    const forms = (data as AddedInternalForm[]) ?? [];
    const ordered = formIds
      .map((id) => forms.find((form) => form.id === id))
      .filter((form): form is AddedInternalForm => form !== undefined);

    setAddedInternalForms(ordered);
  }, []);

  useEffect(() => {
    void loadAddedInternalForms(additionalInternalFormIds);
  }, [additionalInternalFormIds, loadAddedInternalForms]);

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

  const addInternalForm = (form: Form) => {
    const error = validateAdditionalInternalFormId(
      form.id,
      collectionFormIds,
      additionalInternalFormIds,
    );
    if (error) {
      setAddFormError(error);
      return;
    }

    setAddFormError(null);
    onAdditionalInternalFormIdsChange([...additionalInternalFormIds, form.id]);
    setFormSearch("");
    setSearchResults([]);
  };

  const removeInternalForm = (formId: number) => {
    onAdditionalInternalFormIdsChange(
      additionalInternalFormIds.filter((id) => id !== formId),
    );
  };

  const moveInternalForm = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= additionalInternalFormIds.length) {
      return;
    }

    const nextIds = [...additionalInternalFormIds];
    [nextIds[index], nextIds[nextIndex]] = [
      nextIds[nextIndex],
      nextIds[index],
    ];
    onAdditionalInternalFormIdsChange(nextIds);
  };

  const addExternalForm = () => {
    setExternalError(null);
    setExternalWarning(null);

    const trimmedName = externalName.trim();
    if (!trimmedName) {
      setExternalError("Document name is required.");
      return;
    }

    if (!externalFile) {
      setExternalError("Choose a PDF file to upload.");
      return;
    }

    if (externalFile.type && externalFile.type !== "application/pdf") {
      setExternalError("Only PDF files can be uploaded.");
      return;
    }

    const warning = warnDuplicateExternalDocumentName(
      trimmedName,
      allDocumentNames,
    );
    if (warning) {
      setExternalWarning(warning);
    }

    onExternalFormsChange([
      ...externalForms,
      {
        clientId: crypto.randomUUID(),
        documentName: trimmedName,
        file: externalFile,
        notes: externalNotes.trim(),
      },
    ]);

    setExternalName("");
    setExternalNotes("");
    setExternalFile(null);
  };

  const removeExternalForm = (clientId: string) => {
    onExternalFormsChange(
      externalForms.filter((form) => form.clientId !== clientId),
    );
  };

  const moveExternalForm = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= externalForms.length) {
      return;
    }

    const nextForms = [...externalForms];
    [nextForms[index], nextForms[nextIndex]] = [
      nextForms[nextIndex],
      nextForms[index],
    ];
    onExternalFormsChange(nextForms);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium">Default collection forms</h3>
          <p className="text-sm text-muted-foreground">
            These forms come from the selected collection and will be included
            automatically.
          </p>
        </div>

        {collectionLinks.length === 0 ? (
          <p className="text-sm text-destructive">
            The selected collection has no active forms.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {collectionLinks.map((link, index) => (
              <div
                key={link.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {index + 1}.{" "}
                    {link.forms?.form_name ?? `Form #${link.form_id}`}
                  </p>
                  <p className="text-muted-foreground">
                    {link.forms?.form_code ?? "—"}
                    {link.is_required ? " · Required" : " · Optional"}
                  </p>
                </div>
                <Badge variant="secondary">
                  {formatPacketFormOrigin("collection")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium">Additional internal forms</h3>
          <p className="text-sm text-muted-foreground">
            Add optional forms from your forms library that are not in the
            collection.
          </p>
        </div>

        {!disabled && (
          <div className="space-y-2">
            <Label htmlFor="optional_form_search">Search forms</Label>
            <Input
              id="optional_form_search"
              placeholder="Search by name or code..."
              value={formSearch}
              onChange={(event) => setFormSearch(event.target.value)}
              disabled={disabled}
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
                      const alreadyIncluded =
                        collectionFormIds.includes(form.id) ||
                        additionalInternalFormIds.includes(form.id);
                      return (
                        <button
                          key={form.id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => addInternalForm(form)}
                          disabled={alreadyIncluded}
                        >
                          <div>
                            <p className="font-medium">{form.form_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {form.form_code}
                            </p>
                          </div>
                          {alreadyIncluded && (
                            <span className="text-xs text-muted-foreground">
                              Added
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

        {addFormError && (
          <p className="text-sm text-destructive">{addFormError}</p>
        )}

        {addedInternalForms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No additional internal forms added.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {addedInternalForms.map((form, index) => (
              <div
                key={form.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">
                    {collectionLinks.length + index + 1}. {form.form_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {form.form_code}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {formatPacketFormOrigin("added_internal")}
                  </Badge>
                  {!disabled && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveInternalForm(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveInternalForm(index, 1)}
                        disabled={index === addedInternalForms.length - 1}
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeInternalForm(form.id)}
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium">External documents</h3>
          <p className="text-sm text-muted-foreground">
            Upload PDFs that are not reusable app forms, such as a completed
            seller disclosure from an external service.
          </p>
        </div>

        {!disabled && (
          <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="external_document_name">Document name *</Label>
              <Input
                id="external_document_name"
                value={externalName}
                onChange={(event) => setExternalName(event.target.value)}
                placeholder="Seller's Disclosure"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="external_document_file">PDF file *</Label>
              <Input
                id="external_document_file"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setExternalFile(event.target.files?.[0] ?? null)
                }
                disabled={disabled}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="external_document_notes">Notes</Label>
              <Input
                id="external_document_notes"
                value={externalNotes}
                onChange={(event) => setExternalNotes(event.target.value)}
                placeholder="Completed via SellerShield"
                disabled={disabled}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={addExternalForm}
                disabled={disabled}
              >
                Add external document
              </Button>
            </div>
          </div>
        )}

        {externalError && (
          <p className="text-sm text-destructive">{externalError}</p>
        )}
        {externalWarning && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {externalWarning}
          </p>
        )}

        {externalForms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No external documents added.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {externalForms.map((form, index) => (
              <div
                key={form.clientId}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">
                    {collectionLinks.length +
                      addedInternalForms.length +
                      index +
                      1}
                    . {form.documentName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {form.file.name}
                    {form.notes ? ` · ${form.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {formatPacketFormOrigin("external_upload")}
                  </Badge>
                  {!disabled && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveExternalForm(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveExternalForm(index, 1)}
                        disabled={index === externalForms.length - 1}
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeExternalForm(form.clientId)}
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
