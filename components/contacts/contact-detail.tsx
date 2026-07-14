"use client";

import { ContactForm } from "@/components/contacts/contact-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InfoDialog } from "@/components/ui/info-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { saveContactWithOptionalProperty } from "@/lib/contact-save";
import {
  PROPERTY_DUPLICATE_TITLE,
  formatPropertyDuplicateInfoMessage,
} from "@/lib/property-duplicate";
import {
  fetchContactAssociatedPackets,
  formatContactAssociatedPacketType,
  type ContactAssociatedPacket,
} from "@/lib/types/contact-associated-packets";
import {
  type Contact,
  contactToInput,
  emptyContactInput,
  formatContactDisplayName,
  validateContactInput,
} from "@/lib/types/contact";
import {
  formatDateTime,
  formatPacketReference,
  formatPacketStatus,
} from "@/lib/types/packet";
import { emptyPropertyInput, formatPropertyAddress } from "@/lib/types/property";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ContactDetailProps = {
  contactId: number;
};

type FormMode = "hidden" | "edit";

export function ContactDetail({ contactId }: ContactDetailProps) {
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [associatedPackets, setAssociatedPackets] = useState<
    ContactAssociatedPacket[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPackets, setIsLoadingPackets] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [packetsError, setPacketsError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [formValue, setFormValue] = useState(emptyContactInput());
  const [addAddressAsProperty, setAddAddressAsProperty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [propertyDuplicateMessage, setPropertyDuplicateMessage] = useState<
    string | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadContact = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setContact(null);
    } else if (!data) {
      setLoadError("Contact not found.");
      setContact(null);
    } else {
      setContact(data as Contact);
    }

    setIsLoading(false);
  }, [contactId]);

  const loadAssociatedPackets = useCallback(async () => {
    setIsLoadingPackets(true);
    setPacketsError(null);

    try {
      const supabase = createClient();
      const packets = await fetchContactAssociatedPackets(supabase, contactId);
      setAssociatedPackets(packets);
    } catch (error) {
      setPacketsError(
        error instanceof Error
          ? error.message
          : "Failed to load associated packets.",
      );
      setAssociatedPackets([]);
    }

    setIsLoadingPackets(false);
  }, [contactId]);

  useEffect(() => {
    void loadContact();
  }, [loadContact]);

  useEffect(() => {
    void loadAssociatedPackets();
  }, [loadAssociatedPackets]);

  const openEditForm = () => {
    if (!contact) {
      return;
    }

    setFormMode("edit");
    setFormValue(contactToInput(contact));
    setAddAddressAsProperty(false);
    setFormError(null);
  };

  const closeEditForm = () => {
    setFormMode("hidden");
    setFormValue(emptyContactInput());
    setAddAddressAsProperty(false);
    setFormError(null);
  };

  const handleSave = async () => {
    const validationError = validateContactInput(formValue);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      const result = await saveContactWithOptionalProperty(supabase, {
        contact: formValue,
        addAddressAsProperty,
        mode: "edit",
        contactId,
      });

      if (result.propertyDuplicateSkipped && result.duplicatePropertyAddress) {
        setPropertyDuplicateMessage(
          formatPropertyDuplicateInfoMessage(result.duplicatePropertyAddress),
        );
        setAddAddressAsProperty(false);
        setIsSubmitting(false);
        await loadContact();
        return;
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save contact.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeEditForm();
    await loadContact();
  };

  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!contact) {
      return;
    }

    setIsDeleting(true);
    setListError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({ status: "DELETED" })
      .eq("id", contact.id)
      .eq("status", "ACTIVE");

    setIsDeleting(false);

    if (error) {
      setListError(error.message);
      return;
    }

    setDeleteDialogOpen(false);
    router.push("/contacts");
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading contact...</p>
    );
  }

  if (loadError || !contact) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {loadError ?? "Contact not found."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </div>
    );
  }

  const displayName = formatContactDisplayName(contact);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        objectType="contact"
        itemName={displayName}
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
      />
      <InfoDialog
        open={propertyDuplicateMessage != null}
        title={PROPERTY_DUPLICATE_TITLE}
        message={propertyDuplicateMessage ?? ""}
        onClose={() => setPropertyDuplicateMessage(null)}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {contact.contact_type === "ENTITY" ? "Entity" : "Individual"} contact
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/contacts">Back to contacts</Link>
          </Button>
          {formMode === "hidden" && (
            <>
              <Button variant="outline" onClick={openEditForm}>
                Edit
              </Button>
              <Button variant="destructive" onClick={openDeleteDialog}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {listError && <p className="text-sm text-destructive">{listError}</p>}

      {formMode === "edit" ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit contact</CardTitle>
            <CardDescription>Update the selected contact record.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContactForm
              value={formValue}
              onChange={setFormValue}
              addAddressAsProperty={addAddressAsProperty}
              onAddAddressAsPropertyChange={setAddAddressAsProperty}
              onSubmit={() => void handleSave()}
              onCancel={closeEditForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode="edit"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactForm
              value={contactToInput(contact)}
              onChange={() => {}}
              mode="view"
              showActions={false}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Associated Packets</CardTitle>
          <CardDescription>
            Packets where this contact is assigned, regardless of role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {packetsError && (
            <p className="text-sm text-destructive">{packetsError}</p>
          )}

          {isLoadingPackets ? (
            <p className="text-sm text-muted-foreground">Loading packets...</p>
          ) : associatedPackets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No packets associated with this contact yet.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {associatedPackets.map((entry) => {
                const property = entry.packet.properties;
                const propertyAddress = property
                  ? formatPropertyAddress({
                      ...emptyPropertyInput(),
                      street_address: property.street_address,
                      unit: property.unit ?? "",
                      city: property.city,
                      state: property.state,
                      zip: property.zip,
                    })
                  : null;

                return (
                  <Link
                    key={entry.packet.id}
                    href={`/packets/${entry.packet.id}`}
                    className="block p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {entry.packet.label?.trim() || "Unnamed packet"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatPacketReference(entry.packet.id)} ·{" "}
                          {formatContactAssociatedPacketType(
                            entry.packet.packet_type,
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Role: {entry.roles.join(", ")}
                        </p>
                        {propertyAddress && (
                          <p className="text-sm text-muted-foreground">
                            {propertyAddress}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
                        <Badge variant="outline">
                          {formatPacketStatus(entry.packet.status)}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Updated {formatDateTime(entry.packet.update_date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Created {formatDateTime(entry.packet.create_date)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
