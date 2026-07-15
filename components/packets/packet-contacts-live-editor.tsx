"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatContactDisplayName } from "@/lib/types/contact";
import {
  addPacketContact,
  formatPacketContactRole,
  getDefaultPacketRole,
  getPacketContactRolesForWorkflow,
  reorderPacketContact,
  softDeletePacketContact,
  sortPacketContacts,
  updatePacketContactRole,
  validatePacketContactsNotEmpty,
  type PacketContact,
  type PacketContactRole,
} from "@/lib/types/packet-contact";
import type { ListingOwnerKind } from "@/lib/types/listing-packet-kind";
import type { PacketWorkflowType } from "@/lib/types/packet-workflow";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type PacketContactsLiveEditorProps = {
  packetId: number;
  packetContacts: PacketContact[];
  packetType: PacketWorkflowType | null;
  listingOwnerKind?: ListingOwnerKind;
  disabled?: boolean;
  onContactsChange: () => void;
};

export function PacketContactsLiveEditor({
  packetId,
  packetContacts,
  packetType,
  listingOwnerKind = "seller",
  disabled = false,
  onContactsChange,
}: PacketContactsLiveEditorProps) {
  const [draftContactIds, setDraftContactIds] = useState<number[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [contactPendingRemove, setContactPendingRemove] =
    useState<PacketContact | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const activeContacts = sortPacketContacts(
    packetContacts.filter((row) => row.status === "ACTIVE"),
  );
  const roleOptions = getPacketContactRolesForWorkflow(
    packetType,
    listingOwnerKind,
  );

  const handleAddContacts = async () => {
    if (draftContactIds.length === 0) {
      setActionError("Select at least one contact to add.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    const supabase = createClient();

    try {
      let sortOrder =
        activeContacts.length > 0
          ? Math.max(...activeContacts.map((row) => row.sort_order)) + 1
          : 0;

      for (let index = 0; index < draftContactIds.length; index += 1) {
        const contactId = draftContactIds[index];
        const role = getDefaultPacketRole(
          packetType ?? "contract_offer",
          activeContacts.length + index,
          listingOwnerKind,
        );
        await addPacketContact(
          supabase,
          packetId,
          contactId,
          role,
          sortOrder,
        );
        sortOrder += 1;
      }

      setDraftContactIds([]);
      setShowAddContact(false);
      onContactsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to add contact.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (
    packetContactId: number,
    role: PacketContactRole,
  ) => {
    setIsSubmitting(true);
    setActionError(null);
    const supabase = createClient();

    try {
      await updatePacketContactRole(supabase, packetContactId, role);
      onContactsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to update role.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRemoveDialog = (row: PacketContact) => {
    const emptyError = validatePacketContactsNotEmpty(activeContacts.length - 1);
    if (emptyError) {
      setActionError(emptyError);
      return;
    }

    setContactPendingRemove(row);
    setActionError(null);
  };

  const closeRemoveDialog = () => {
    if (isRemoving) {
      return;
    }
    setContactPendingRemove(null);
  };

  const handleConfirmRemove = async () => {
    if (!contactPendingRemove) {
      return;
    }

    setIsRemoving(true);
    setIsSubmitting(true);
    setActionError(null);
    const supabase = createClient();

    try {
      await softDeletePacketContact(supabase, contactPendingRemove.id);
      setContactPendingRemove(null);
      onContactsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to remove contact.",
      );
    } finally {
      setIsRemoving(false);
      setIsSubmitting(false);
    }
  };

  const handleReorder = async (packetContactId: number, direction: -1 | 1) => {
    setIsSubmitting(true);
    setActionError(null);
    const supabase = createClient();

    try {
      await reorderPacketContact(supabase, packetContactId, direction);
      onContactsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to reorder contacts.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDeleteDialog
        open={contactPendingRemove != null}
        objectType="packet contact"
        title="Remove packet contact?"
        itemName={
          contactPendingRemove?.contacts
            ? formatContactDisplayName(contactPendingRemove.contacts)
            : contactPendingRemove
              ? `Contact #${contactPendingRemove.contact_id}`
              : null
        }
        consequence="It will be removed from this packet and can be added again later."
        confirmLabel="Remove"
        confirmingLabel="Removing…"
        isConfirming={isRemoving}
        onConfirm={() => void handleConfirmRemove()}
        onCancel={closeRemoveDialog}
      />
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setShowAddContact((value) => !value);
            setActionError(null);
          }}
          disabled={isSubmitting}
        >
          Add contact
        </Button>
      )}

      {showAddContact && !disabled && (
        <div className="space-y-3 rounded-md border p-4">
          <ContactPicker
            selectedContactIds={draftContactIds}
            onChange={setDraftContactIds}
            disabled={isSubmitting}
            searchLabel="Search contacts"
            selectedLabel="Contacts to add"
            emptySelectedMessage="No contacts selected yet."
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleAddContacts()}
            disabled={isSubmitting || draftContactIds.length === 0}
          >
            {isSubmitting ? "Adding..." : "Add to packet"}
          </Button>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {activeContacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contacts assigned to this packet.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {activeContacts.map((row, index) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="font-medium">
                  {index + 1}.{" "}
                  {row.contacts
                    ? formatContactDisplayName(row.contacts)
                    : `Contact #${row.contact_id}`}
                </p>
                {!disabled ? (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`role_${row.id}`} className="sr-only">
                      Role
                    </Label>
                    <Select
                      id={`role_${row.id}`}
                      value={row.packet_role}
                      onChange={(event) =>
                        void handleRoleChange(
                          row.id,
                          event.target.value as PacketContactRole,
                        )
                      }
                      disabled={isSubmitting}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {formatPacketContactRole(role)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <Badge variant="outline">
                    {formatPacketContactRole(row.packet_role)}
                  </Badge>
                )}
              </div>

              {!disabled && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => void handleReorder(row.id, -1)}
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
                    onClick={() => void handleReorder(row.id, 1)}
                    disabled={
                      isSubmitting || index === activeContacts.length - 1
                    }
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openRemoveDialog(row)}
                    disabled={isSubmitting || activeContacts.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
