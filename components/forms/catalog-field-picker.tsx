"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Field } from "@/lib/types/field";
import { formatFieldSourceMappingCatalog } from "@/lib/types/field-source";
import { cn } from "@/lib/utils";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type CatalogFieldPickerProps = {
  fields: Field[];
  value: string;
  onChange: (fieldId: string, field: Field | undefined) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  id?: string;
};

function fieldSearchHaystack(field: Field): string {
  return [
    field.field_key,
    field.field_name,
    field.field_label,
    field.source_path,
    field.resolver_key,
    formatFieldSourceMappingCatalog(field),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatPickerSource(field: Field): string | null {
  const mapping = formatFieldSourceMappingCatalog(field);
  if (mapping) {
    return mapping;
  }

  if (field.source_type === "packet_instance") {
    return "packet_instance";
  }

  return null;
}

export function CatalogFieldPicker({
  fields,
  value,
  onChange,
  disabled = false,
  required = false,
  label = "Catalog field",
  id,
}: CatalogFieldPickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedField = fields.find((field) => field.id === value);

  const filteredFields = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return fields;
    }

    return fields.filter((field) =>
      fieldSearchHaystack(field).includes(normalizedQuery),
    );
  }, [fields, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (selectedField) {
      setQuery(
        selectedField.field_label?.trim() ||
          selectedField.field_name?.trim() ||
          selectedField.field_key,
      );
    }
  }, [selectedField?.id]);

  const handleSelect = (field: Field) => {
    onChange(field.id, field);
    setQuery(field.field_label?.trim() || field.field_name?.trim() || field.field_key);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={query}
        placeholder="Search by label, key, name, or source path..."
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value.trim()) {
            onChange("", undefined);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {selectedField && (
        <p className="font-mono text-xs text-muted-foreground">{selectedField.field_key}</p>
      )}

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {filteredFields.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching fields.</p>
          ) : (
            filteredFields.map((field) => {
              const displayLabel =
                field.field_label?.trim() ||
                field.field_name?.trim() ||
                field.field_key;
              const sourceLabel = formatPickerSource(field);

              return (
                <button
                  key={field.id}
                  type="button"
                  role="option"
                  aria-selected={field.id === value}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60",
                    field.id === value && "bg-muted/40",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(field)}
                >
                  <span className="font-medium leading-snug">{displayLabel}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {field.field_key}
                  </span>
                  {sourceLabel && (
                    <span className="truncate text-xs text-muted-foreground/90">
                      {sourceLabel}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
