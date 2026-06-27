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
import { createClient } from "@/lib/supabase/client";
import {
  type Contact,
  contactToInput,
  emptyContactInput,
  formatContactDisplayName,
  normalizeContactInput,
  validateContactInput,
} from "@/lib/types/contact";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit";

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [formValue, setFormValue] = useState(emptyContactInput());

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

  const openCreateForm = () => {
    setFormMode("create");
    setEditingContactId(null);
    setFormValue(emptyContactInput());
    setFormError(null);
  };

  const openEditForm = (contact: Contact) => {
    setFormMode("edit");
    setEditingContactId(contact.id);
    setFormValue(contactToInput(contact));
    setFormError(null);
  };

  const closeForm = () => {
    setFormMode("hidden");
    setEditingContactId(null);
    setFormValue(emptyContactInput());
    setFormError(null);
  };

  const handleSave = async () => {
    const normalized = normalizeContactInput(formValue);
    const validationError = validateContactInput(normalized);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    if (formMode === "create") {
      const { error } = await supabase.from("contacts").insert(normalized);

      if (error) {
        setFormError(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    if (formMode === "edit" && editingContactId !== null) {
      const { error } = await supabase
        .from("contacts")
        .update(normalized)
        .eq("id", editingContactId)
        .eq("status", "ACTIVE");

      if (error) {
        setFormError(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    closeForm();
    await loadContacts();
  };

  const handleDelete = async (contact: Contact) => {
    const displayName = formatContactDisplayName(contact);
    const confirmed = window.confirm(
      `Delete ${displayName}? This will mark the contact as deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setListError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({ status: "DELETED" })
      .eq("id", contact.id)
      .eq("status", "ACTIVE");

    if (error) {
      setListError(error.message);
      return;
    }

    if (editingContactId === contact.id) {
      closeForm();
    }

    await loadContacts();
  };

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
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
        <Card>
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
                      onClick={() => void handleDelete(contact)}
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
