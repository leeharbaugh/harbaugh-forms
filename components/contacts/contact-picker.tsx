"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  type Contact,
  formatContactDisplayName,
} from "@/lib/types/contact";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ContactPickerProps = {
  selectedContactIds: number[];
  onChange: (contactIds: number[]) => void;
  disabled?: boolean;
  error?: string | null;
  searchLabel?: string;
  selectedLabel?: string;
  emptySelectedMessage?: string;
};

export function ContactPicker({
  selectedContactIds,
  onChange,
  disabled = false,
  error,
  searchLabel = "Search contacts",
  selectedLabel = "Selected contacts",
  emptySelectedMessage = "No contacts selected yet.",
}: ContactPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);

  const loadSelectedContacts = useCallback(async (contactIds: number[]) => {
    if (contactIds.length === 0) {
      setSelectedContacts([]);
      return;
    }

    setIsLoadingSelected(true);
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("status", "ACTIVE")
      .in("id", contactIds);

    if (fetchError) {
      setSelectedContacts([]);
      setIsLoadingSelected(false);
      return;
    }

    const contacts = (data as Contact[]) ?? [];
    const ordered = contactIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact): contact is Contact => contact !== undefined);

    setSelectedContacts(ordered);
    setIsLoadingSelected(false);
  }, []);

  useEffect(() => {
    void loadSelectedContacts(selectedContactIds);
  }, [selectedContactIds, loadSelectedContacts]);

  const searchContacts = useCallback(async () => {
    const trimmedSearch = searchQuery.trim();
    if (!trimmedSearch) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const supabase = createClient();
    const term = `%${trimmedSearch}%`;

    const { data, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("status", "ACTIVE")
      .or(
        [
          `first_name.ilike.${term}`,
          `last_name.ilike.${term}`,
          `entity_name.ilike.${term}`,
          `email.ilike.${term}`,
          `phone_primary.ilike.${term}`,
        ].join(","),
      )
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("entity_name", { ascending: true, nullsFirst: false })
      .limit(10);

    if (fetchError) {
      setSearchResults([]);
    } else {
      setSearchResults((data as Contact[]) ?? []);
    }

    setIsSearching(false);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void searchContacts();
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchContacts]);

  const addContact = (contact: Contact) => {
    if (selectedContactIds.includes(contact.id)) {
      return;
    }
    onChange([...selectedContactIds, contact.id]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeContact = (contactId: number) => {
    onChange(selectedContactIds.filter((id) => id !== contactId));
  };

  const moveContact = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedContactIds.length) {
      return;
    }

    const nextIds = [...selectedContactIds];
    [nextIds[index], nextIds[nextIndex]] = [
      nextIds[nextIndex],
      nextIds[index],
    ];
    onChange(nextIds);
  };

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="space-y-2">
          <Label htmlFor="contact_search">{searchLabel}</Label>
          <Input
            id="contact_search"
            placeholder="Search by name, entity, email, or phone..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            disabled={disabled}
          />
          {searchQuery.trim() && (
            <div className="rounded-md border">
              {isSearching ? (
                <p className="p-3 text-sm text-muted-foreground">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching contacts found.
                </p>
              ) : (
                <div className="divide-y">
                  {searchResults.map((contact) => {
                    const isSelected = selectedContactIds.includes(contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => addContact(contact)}
                        disabled={isSelected}
                      >
                        <div>
                          <p className="font-medium">
                            {formatContactDisplayName(contact)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {contact.email ?? "No email"}
                            {contact.phone_primary
                              ? ` · ${contact.phone_primary}`
                              : ""}
                          </p>
                        </div>
                        {isSelected && (
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

      <div className="space-y-2">
        <Label>{selectedLabel}</Label>
        {isLoadingSelected ? (
          <p className="text-sm text-muted-foreground">Loading contacts...</p>
        ) : selectedContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptySelectedMessage}
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {selectedContacts.map((contact, index) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">
                    {index + 1}. {formatContactDisplayName(contact)}
                  </p>
                  {contact.email && (
                    <p className="text-sm text-muted-foreground">
                      {contact.email}
                    </p>
                  )}
                </div>
                {!disabled && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveContact(index, -1)}
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
                      onClick={() => moveContact(index, 1)}
                      disabled={index === selectedContacts.length - 1}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeContact(contact.id)}
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
