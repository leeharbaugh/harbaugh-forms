"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import type { PacketWorkflowType } from "@/lib/types/packet-workflow";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type PacketContactsLiveEditorProps = {
  packetId: number;
  packetContacts: PacketContact[];
  packetType: PacketWorkflowType | null;
  disabled?: boolean;
  onContactsChange: () => void;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function PacketContactsLiveEditor({
  packetId,
  packetContacts,
  packetType,
  disabled = false,
  onContactsChange,
}: PacketContactsLiveEditorProps) {
  const [draftContactIds, setDraftContactIds] = useState<number[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeContacts = sortPacketContacts(
    packetContacts.filter((row) => row.status === "ACTIVE"),
  );
  const roleOptions = getPacketContactRolesForWorkflow(packetType);

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

  const handleRemove = async (packetContactId: number) => {
    const emptyError = validatePacketContactsNotEmpty(activeContacts.length - 1);
    if (emptyError) {
      setActionError(emptyError);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    const supabase = createClient();

    try {
      await softDeletePacketContact(supabase, packetContactId);
      onContactsChange();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to remove contact.",
      );
    } finally {
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
                    <select
                      id={`role_${row.id}`}
                      className={fieldClassName}
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
                    </select>
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
                    onClick={() => void handleRemove(row.id)}
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
