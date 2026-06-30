"use client";

import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  type Form,
  formatFormCategory,
  formatFormReference,
} from "@/lib/types/form";
import type { CollectionFormSelection } from "@/lib/types/collection";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type FormPickerProps = {
  selectedForms: CollectionFormSelection[];
  onChange: (forms: CollectionFormSelection[]) => void;
  disabled?: boolean;
  error?: string | null;
};

export function FormPicker({
  selectedForms,
  onChange,
  disabled = false,
  error,
}: FormPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Form[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Form[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);

  const loadSelectedTemplates = useCallback(
    async (forms: CollectionFormSelection[]) => {
      if (forms.length === 0) {
        setSelectedTemplates([]);
        return;
      }

      setIsLoadingSelected(true);
      const supabase = createClient();
      const formIds = forms.map((form) => form.form_id);
      const { data, error: fetchError } = await supabase
        .from("forms")
        .select("*")
        .eq("status", "ACTIVE")
        .in("id", formIds);

      if (fetchError) {
        setSelectedTemplates([]);
        setIsLoadingSelected(false);
        return;
      }

      const templates = (data as Form[]) ?? [];
      const ordered = forms
        .map((form) =>
          templates.find((template) => template.id === form.form_id),
        )
        .filter((template): template is Form => template !== undefined);

      setSelectedTemplates(ordered);
      setIsLoadingSelected(false);
    },
    [],
  );

  useEffect(() => {
    void loadSelectedTemplates(selectedForms);
  }, [selectedForms, loadSelectedTemplates]);

  const searchTemplates = useCallback(async () => {
    const trimmedSearch = searchQuery.trim();
    if (!trimmedSearch) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const supabase = createClient();
    const term = `%${trimmedSearch}%`;

    const { data, error: fetchError } = await supabase
      .from("forms")
      .select("*")
      .eq("status", "ACTIVE")
      .or(
        [
          `form_name.ilike.${term}`,
          `form_code.ilike.${term}`,
          `form_category.ilike.${term}`,
        ].join(","),
      )
      .order("form_name", { ascending: true })
      .limit(10);

    if (fetchError) {
      setSearchResults([]);
    } else {
      setSearchResults((data as Form[]) ?? []);
    }

    setIsSearching(false);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void searchTemplates();
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchTemplates]);

  const selectedFormIds = selectedForms.map((form) => form.form_id);

  const addTemplate = (template: Form) => {
    if (selectedFormIds.includes(template.id)) {
      return;
    }

    onChange([
      ...selectedForms,
      { form_id: template.id, is_required: true },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeTemplate = (formTemplateId: number) => {
    onChange(
      selectedForms.filter((form) => form.form_id !== formTemplateId),
    );
  };

  const moveTemplate = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedForms.length) {
      return;
    }

    const nextForms = [...selectedForms];
    [nextForms[index], nextForms[nextIndex]] = [
      nextForms[nextIndex],
      nextForms[index],
    ];
    onChange(nextForms);
  };

  const setRequired = (formTemplateId: number, isRequired: boolean) => {
    onChange(
      selectedForms.map((form) =>
        form.form_id === formTemplateId
          ? { ...form, is_required: isRequired }
          : form,
      ),
    );
  };

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="space-y-2">
          <Label htmlFor="form_template_search">Search form templates</Label>
          <Input
            id="form_template_search"
            placeholder="Search by name, code, or category..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            disabled={disabled}
          />
          {searchQuery.trim() && (
            <div className="rounded-md border">
              {isSearching ? (
                <p className="p-3 text-sm text-muted-foreground">
                  Searching...
                </p>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching form templates found.
                </p>
              ) : (
                <div className="divide-y">
                  {searchResults.map((template) => {
                    const isSelected = selectedFormIds.includes(template.id);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => addTemplate(template)}
                        disabled={isSelected}
                      >
                        <div>
                          <p className="font-medium">{template.form_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFormReference(template.id)} ·{" "}
                            {template.form_code} ·{" "}
                            {formatFormCategory(template.form_category)}
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
        <Label>Selected forms *</Label>
        {isLoadingSelected ? (
          <p className="text-sm text-muted-foreground">Loading forms...</p>
        ) : selectedTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No form templates selected yet.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {selectedTemplates.map((template, index) => {
              const selection = selectedForms.find(
                (form) => form.form_id === template.id,
              );

              return (
                <div
                  key={template.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {index + 1}. {template.form_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatFormReference(template.id)} ·{" "}
                      {template.form_code} ·{" "}
                      {formatFormCategory(template.form_category)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <div className="flex items-center gap-2">
                      <AppCheckbox
                        id={`form_required_${template.id}`}
                        checked={selection?.is_required ?? true}
                        onCheckedChange={(checked) =>
                          setRequired(template.id, checked === true)
                        }
                        disabled={disabled}
                      />
                      <Label
                        htmlFor={`form_required_${template.id}`}
                        className="font-normal"
                      >
                        Required
                      </Label>
                    </div>
                    {!disabled && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveTemplate(index, -1)}
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
                          onClick={() => moveTemplate(index, 1)}
                          disabled={index === selectedTemplates.length - 1}
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeTemplate(template.id)}
                          aria-label="Remove"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
