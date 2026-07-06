"use client";

import { CollectionForm } from "@/components/collections/collection-form";
import { ListRowActions } from "@/components/list-row-actions";
import {
  ResizableDataTable,
  ResizableDataTableActionsCell,
  ResizableDataTableCell,
  ResizableDataTableRow,
  type ResizableDataTableColumn,
} from "@/components/resizable-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  type CollectionDetail,
  type CollectionListItem,
  deleteCollection,
  emptyCollectionInput,
  formatCollectionReference,
  formatCollectionType,
  getActiveFormLinkCount,
  isCollectionDeleted,
  normalizeCollectionInput,
  collectionToInput,
  restoreCollection,
  syncCollectionForms,
  validateCollectionInput,
} from "@/lib/types/collection";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit" | "view";

const COLLECTION_TABLE_COLUMNS: ResizableDataTableColumn[] = [
  { id: "id", label: "ID", defaultWidth: 72, minWidth: 48 },
  { id: "name", label: "Packet name", defaultWidth: 200 },
  { id: "type", label: "Packet type", defaultWidth: 140 },
  { id: "description", label: "Description", defaultWidth: 260 },
  { id: "forms", label: "Forms", defaultWidth: 80, minWidth: 64 },
  {
    id: "actions",
    label: "Actions",
    defaultWidth: 224,
    isActions: true,
  },
];

const PACKET_LIST_SELECT = `
  *,
  collection_forms(
    id,
    status
  )
`;

const PACKET_DETAIL_SELECT = `
  *,
  collection_forms(
    id,
    form_id,
    sort_order,
    is_required,
    status,
    forms(
      id,
      form_name,
      form_code,
      form_category
    )
  )
`;

const DELETE_DIALOG_MESSAGE =
  "Are you sure you want to delete this packet template? This will hide it from normal use but will not remove historical generated packets.";

export function CollectionsPage() {
  const [packets, setPackets] = useState<CollectionListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingPacketId, setEditingPacketId] = useState<number | null>(null);
  const [viewingPacketStatus, setViewingPacketStatus] = useState<string>("ACTIVE");
  const [formValue, setFormValue] = useState(emptyCollectionInput());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [packetPendingDelete, setPacketPendingDelete] =
    useState<CollectionListItem | null>(null);

  const loadPackets = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("collections")
      .select(PACKET_LIST_SELECT)
      .order("collection_name", { ascending: true });

    if (showDeleted) {
      query = query.in("status", ["ACTIVE", "DELETED"]);
    } else {
      query = query.eq("status", "ACTIVE");
    }

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `collection_name.ilike.${term}`,
          `collection_type.ilike.${term}`,
          `description.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setPackets([]);
    } else {
      setPackets((data as CollectionListItem[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery, showDeleted]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPackets();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadPackets]);

  const resetFormState = () => {
    setFormValue(emptyCollectionInput());
    setFormError(null);
    setViewingPacketStatus("ACTIVE");
  };

  const closeForm = () => {
    setFormMode("hidden");
    setEditingPacketId(null);
    resetFormState();
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingPacketId(null);
    resetFormState();
  };

  const openPacketForm = async (packetId: number, mode: "edit" | "view") => {
    setFormError(null);
    setListError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("collections")
      .select(PACKET_DETAIL_SELECT)
      .eq("id", packetId)
      .single();

    if (error || !data) {
      setListError(error?.message ?? "Packet template not found.");
      return;
    }

    const packet = data as CollectionDetail;

    if (mode === "edit" && isCollectionDeleted(packet)) {
      setListError("Deleted packet templates cannot be edited. Restore it first.");
      return;
    }

    setFormMode(mode);
    setEditingPacketId(packet.id);
    setViewingPacketStatus(packet.status);
    setFormValue(collectionToInput(packet));
  };

  const reloadOpenPacket = async (packetId: number) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("collections")
      .select(PACKET_DETAIL_SELECT)
      .eq("id", packetId)
      .single();

    if (error || !data) {
      setFormError(error?.message ?? "Packet template not found.");
      return;
    }

    const packet = data as CollectionDetail;
    setViewingPacketStatus(packet.status);
    setFormValue(collectionToInput(packet));
    setFormMode("view");
    setEditingPacketId(packet.id);
  };

  const handleSave = async () => {
    const validationError = validateCollectionInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeCollectionInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      if (formMode === "create") {
        const { data: createdPacket, error: createError } = await supabase
          .from("collections")
          .insert({
            collection_name: normalized.collection_name,
            collection_type: normalized.collection_type,
            description: normalized.description,
          })
          .select("id")
          .single();

        if (createError || !createdPacket) {
          setFormError(createError?.message ?? "Failed to create packet template.");
          setIsSubmitting(false);
          return;
        }

        await syncCollectionForms(
          supabase,
          createdPacket.id,
          normalized.forms,
        );
      }

      if (formMode === "edit" && editingPacketId !== null) {
        const { error: updateError } = await supabase
          .from("collections")
          .update({
            collection_name: normalized.collection_name,
            collection_type: normalized.collection_type,
            description: normalized.description,
          })
          .eq("id", editingPacketId)
          .eq("status", "ACTIVE");

        if (updateError) {
          setFormError(updateError.message);
          setIsSubmitting(false);
          return;
        }

        await syncCollectionForms(
          supabase,
          editingPacketId,
          normalized.forms,
        );
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save packet template.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeForm();
    await loadPackets();
  };

  const openDeleteDialog = (packet: CollectionListItem) => {
    setPacketPendingDelete(packet);
    setDeleteDialogOpen(true);
    setListError(null);
    setFormError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
    setPacketPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!packetPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);
    setFormError(null);

    const supabase = createClient();

    try {
      await deleteCollection(supabase, packetPendingDelete.id);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete packet template.";

      if (editingPacketId === packetPendingDelete.id) {
        setFormError(message);
      } else {
        setListError(message);
      }

      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setPacketPendingDelete(null);

    if (editingPacketId === packetPendingDelete.id) {
      await reloadOpenPacket(packetPendingDelete.id);
    } else {
      closeForm();
    }

    await loadPackets();
  };

  const handleRestore = async () => {
    if (editingPacketId === null) {
      return;
    }

    setIsRestoring(true);
    setFormError(null);
    setListError(null);

    const supabase = createClient();

    try {
      await restoreCollection(supabase, editingPacketId);
      await reloadOpenPacket(editingPacketId);
      await loadPackets();
    } catch (restoreError) {
      setFormError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to restore packet template.",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const formTitle =
    formMode === "create"
      ? "Add packet template"
      : formMode === "edit"
        ? "Edit packet template"
        : isCollectionDeleted({ status: viewingPacketStatus })
          ? "Deleted packet template"
          : "View packet template";

  const formDescription =
    formMode === "create"
      ? "Create a reusable group of form templates for document packets."
      : formMode === "edit"
        ? "Update packet details, form selection, order, and required flags."
        : isCollectionDeleted({ status: viewingPacketStatus })
          ? "This packet template is hidden from normal use. Historical generated packets are unchanged."
          : "Read-only view of the packet template.";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Packet Template"
        message={DELETE_DIALOG_MESSAGE}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
        variant="destructive"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Packet Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Define reusable groups of form templates for buyer rep, listing,
            offer, and amendment packets.
          </p>
        </div>
        {formMode === "hidden" && (
          <Button onClick={openCreateForm}>Add packet template</Button>
        )}
      </div>

      {formMode !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <CollectionForm
              value={formValue}
              onChange={setFormValue}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={formMode === "view" ? "view" : formMode}
              packetTemplateId={editingPacketId}
              status={viewingPacketStatus}
              onDelete={
                formMode === "view" &&
                !isCollectionDeleted({ status: viewingPacketStatus }) &&
                editingPacketId !== null
                  ? () => {
                      const packet = packets.find(
                        (item) => item.id === editingPacketId,
                      );
                      if (packet) {
                        openDeleteDialog(packet);
                        return;
                      }

                      openDeleteDialog({
                        id: editingPacketId,
                        collection_name: formValue.collection_name,
                        collection_type: formValue.collection_type,
                        description: formValue.description || null,
                        create_date: "",
                        update_date: "",
                        status: viewingPacketStatus,
                      });
                    }
                  : undefined
              }
              onRestore={
                formMode === "view" &&
                isCollectionDeleted({ status: viewingPacketStatus })
                  ? () => void handleRestore()
                  : undefined
              }
              isDeleting={isDeleting}
              isRestoring={isRestoring}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {showDeleted ? "Packet templates" : "Active packet templates"}
          </CardTitle>
          <CardDescription>
            Search by packet name, type, or description.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search packet templates..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <div className="flex items-center gap-2">
            <AppCheckbox
              id="show_deleted_packet_templates"
              checked={showDeleted}
              onCheckedChange={(checked) => setShowDeleted(checked === true)}
            />
            <Label htmlFor="show_deleted_packet_templates" className="font-normal">
              Show deleted
            </Label>
          </div>

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading packet templates...
            </p>
          ) : packets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {showDeleted
                ? "No packet templates found."
                : "No active packet templates found."}
            </p>
          ) : (
            <ResizableDataTable
              storageKey="harbaugh-collections-list-column-widths"
              tablePreferencesKey="collections_list"
              columns={COLLECTION_TABLE_COLUMNS}
            >
              {packets.map((packet) => {
                const deleted = isCollectionDeleted(packet);
                const description = packet.description ?? "—";

                return (
                  <ResizableDataTableRow
                    key={packet.id}
                    className={deleted ? "bg-muted/30 opacity-70" : undefined}
                  >
                    <ResizableDataTableCell className="text-muted-foreground">
                      {formatCollectionReference(packet.id)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="truncate font-medium"
                          title={packet.collection_name}
                        >
                          {packet.collection_name}
                        </span>
                        {deleted && (
                          <Badge variant="destructive" className="shrink-0">
                            Deleted
                          </Badge>
                        )}
                      </div>
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate>
                      {formatCollectionType(packet.collection_type)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={description === "—" ? undefined : description}
                    >
                      {description}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      {getActiveFormLinkCount(packet)}
                    </ResizableDataTableCell>
                    <ResizableDataTableActionsCell>
                      <ListRowActions>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openPacketForm(packet.id, "view")}
                        >
                          View
                        </Button>
                        {!deleted && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void openPacketForm(packet.id, "edit")
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteDialog(packet)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </ListRowActions>
                    </ResizableDataTableActionsCell>
                  </ResizableDataTableRow>
                );
              })}
            </ResizableDataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
