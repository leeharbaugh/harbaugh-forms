"use client";

import { ContactForm } from "@/components/contacts/contact-form";
import { ListRowActions } from "@/components/list-row-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InfoDialog } from "@/components/ui/info-dialog";
import { createClient } from "@/lib/supabase/client";
import { saveContactWithOptionalProperty } from "@/lib/contact-save";
import {
  PROPERTY_DUPLICATE_TITLE,
  formatPropertyDuplicateInfoMessage,
} from "@/lib/property-duplicate";
import {
  type Contact,
  contactToInput,
  emptyContactInput,
  formatContactDisplayName,
  validateContactInput,
} from "@/lib/types/contact";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONTACTS_LIST_RESET_EVENT } from "@/lib/contacts-list-reset";

type FormMode = "hidden" | "create" | "edit";

export function ContactsPage() {
  const pathname = usePathname();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [formValue, setFormValue] = useState(emptyContactInput());
  const [addAddressAsProperty, setAddAddressAsProperty] = useState(false);
  const [propertyDuplicateMessage, setPropertyDuplicateMessage] = useState<
    string | null
  >(null);
  const [contactPendingDelete, setContactPendingDelete] =
    useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("contacts")
      .select("*")
      .eq("status", "ACTIVE")
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("entity_name", { ascending: true, nullsFirst: false });

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `first_name.ilike.${term}`,
          `last_name.ilike.${term}`,
          `preferred_name.ilike.${term}`,
          `entity_name.ilike.${term}`,
          `company_name.ilike.${term}`,
          `trec_license_number.ilike.${term}`,
          `email.ilike.${term}`,
          `phone_primary.ilike.${term}`,
          `phone_secondary.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setContacts([]);
    } else {
      setContacts((data as Contact[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadContacts();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadContacts]);

  const closeForm = useCallback(() => {
    setFormMode("hidden");
    setEditingContactId(null);
    setFormValue(emptyContactInput());
    setAddAddressAsProperty(false);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (pathname === "/contacts") {
      closeForm();
    }
  }, [pathname, closeForm]);

  useEffect(() => {
    const handleReset = () => {
      closeForm();
    };

    window.addEventListener(CONTACTS_LIST_RESET_EVENT, handleReset);
    return () => {
      window.removeEventListener(CONTACTS_LIST_RESET_EVENT, handleReset);
    };
  }, [closeForm]);

  useEffect(() => {
    if (formMode === "hidden") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [formMode, editingContactId]);

  const openCreateForm = () => {
    setFormMode("create");
    setEditingContactId(null);
    setFormValue(emptyContactInput());
    setAddAddressAsProperty(false);
    setFormError(null);
  };

  const openEditForm = (contact: Contact) => {
    setFormMode("edit");
    setEditingContactId(contact.id);
    setFormValue(contactToInput(contact));
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
        mode: formMode === "create" ? "create" : "edit",
        contactId: editingContactId ?? undefined,
      });

      if (result.propertyDuplicateSkipped && result.duplicatePropertyAddress) {
        setPropertyDuplicateMessage(
          formatPropertyDuplicateInfoMessage(result.duplicatePropertyAddress),
        );
        setAddAddressAsProperty(false);
        if (formMode === "create") {
          setFormMode("edit");
          setEditingContactId(result.contactId);
        }
        setIsSubmitting(false);
        await loadContacts();
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
    closeForm();
    await loadContacts();
  };

  const openDeleteDialog = (contact: Contact) => {
    setContactPendingDelete(contact);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setContactPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!contactPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({ status: "DELETED" })
      .eq("id", contactPendingDelete.id)
      .eq("status", "ACTIVE");

    setIsDeleting(false);

    if (error) {
      setListError(error.message);
      return;
    }

    if (editingContactId === contactPendingDelete.id) {
      closeForm();
    }

    setContactPendingDelete(null);
    await loadContacts();
  };

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <ConfirmDeleteDialog
        open={contactPendingDelete != null}
        objectType="contact"
        itemName={
          contactPendingDelete
            ? formatContactDisplayName(contactPendingDelete)
            : null
        }
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
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Manage active contacts for Harbaugh Forms.
          </p>
        </div>
        {formMode === "hidden" && (
          <Button onClick={openCreateForm}>Add contact</Button>
        )}
      </div>

      {formMode !== "hidden" && (
        <Card ref={formPanelRef} className="scroll-mt-6">
          <CardHeader>
            <CardTitle>
              {formMode === "create" ? "Add contact" : "Edit contact"}
            </CardTitle>
            <CardDescription>
              {formMode === "create"
                ? "Create a new active contact record."
                : "Update the selected contact record."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContactForm
              value={formValue}
              onChange={setFormValue}
              addAddressAsProperty={addAddressAsProperty}
              onAddAddressAsPropertyChange={setAddAddressAsProperty}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={formMode}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active contacts</CardTitle>
          <CardDescription>
            Search by name, entity, email, or phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading contacts...</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active contacts found.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{formatContactDisplayName(contact)}</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.contact_type === "ENTITY" ? "Entity" : "Individual"}
                      {contact.email ? ` · ${contact.email}` : ""}
                      {contact.phone_primary ? ` · ${contact.phone_primary}` : ""}
                    </p>
                    {(contact.mailing_city || contact.mailing_state) && (
                      <p className="text-sm text-muted-foreground">
                        {[contact.mailing_city, contact.mailing_state]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <ListRowActions align="start" className="sm:justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/contacts/${contact.id}`}>View</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditForm(contact)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteDialog(contact)}
                    >
                      Delete
                    </Button>
                  </ListRowActions>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
