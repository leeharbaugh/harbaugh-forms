"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldAdminInput } from "@/lib/types/field";
import {
  CUSTOM_RESOLVER_KEYS,
  FIELD_SOURCE_TYPES,
  formatFieldSourceStatusDisplay,
  formatFieldSourceType,
  sourcePathsForType,
  sourceTypeAllowsFallbackValue,
  sourceTypeRequiresPath,
  sourceTypeRequiresResolverKey,
  type FieldSourceType,
} from "@/lib/types/field-source";

type FieldSourceFormFieldsProps = {
  value: FieldAdminInput;
  onChange: (value: FieldAdminInput) => void;
  readOnly: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function FieldSourceFormFields({
  value,
  onChange,
  readOnly,
}: FieldSourceFormFieldsProps) {
  const sourceType = value.source_type;
  const pathOptions = sourceType ? sourcePathsForType(sourceType) : [];
  const showSourcePath = sourceType && sourceTypeRequiresPath(sourceType);
  const showResolverKey =
    sourceType && sourceTypeRequiresResolverKey(sourceType);
  const showFallbackValue =
    sourceType && sourceTypeAllowsFallbackValue(sourceType);

  const sourceStatus = formatFieldSourceStatusDisplay(value);

  const setSourceType = (nextType: FieldSourceType | "") => {
    onChange({
      ...value,
      source_type: nextType,
      source_path: "",
      resolver_key: "",
      fallback_value:
        nextType === "static_default" ||
        nextType === "manual_only" ||
        nextType === "packet_instance"
          ? value.fallback_value
          : "",
    });
  };

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">Value source</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Defines where this field resolves its value in packets. The same
          mapping applies wherever the field is placed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="source_type">Source type</Label>
          <select
            id="source_type"
            className={fieldClassName}
            value={sourceType}
            onChange={(event) =>
              setSourceType(event.target.value as FieldSourceType | "")
            }
            disabled={readOnly}
          >
            <option value="">Unmapped (no explicit source type)</option>
            {FIELD_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatFieldSourceType(type)}
              </option>
            ))}
          </select>
          {!sourceType && (
            <p className="text-xs text-muted-foreground">
              {sourceStatus.helperText}
            </p>
          )}
        </div>

        {showSourcePath && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="source_path">Source path</Label>
            <select
              id="source_path"
              className={fieldClassName}
              value={value.source_path}
              onChange={(event) =>
                onChange({ ...value, source_path: event.target.value })
              }
              disabled={readOnly}
            >
              <option value="">Select source path...</option>
              {pathOptions.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </div>
        )}

        {showResolverKey && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resolver_key">Resolver key</Label>
            <select
              id="resolver_key"
              className={fieldClassName}
              value={value.resolver_key}
              onChange={(event) =>
                onChange({ ...value, resolver_key: event.target.value })
              }
              disabled={readOnly}
            >
              <option value="">Select resolver key...</option>
              {CUSTOM_RESOLVER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for computed values such as full names.
            </p>
          </div>
        )}

        {showFallbackValue && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fallback_value">
              Fallback value
              {sourceType === "static_default" ? " *" : ""}
            </Label>
            <Input
              id="fallback_value"
              value={value.fallback_value}
              onChange={(event) =>
                onChange({ ...value, fallback_value: event.target.value })
              }
              disabled={readOnly}
              placeholder={
                sourceType === "static_default"
                  ? "e.g. NA or true"
                  : "Optional default when left blank"
              }
            />
            {sourceType === "static_default" &&
              value.source_path === "default_checked" && (
                <p className="text-xs text-muted-foreground">
                  Use <code className="text-xs">true</code> or{" "}
                  <code className="text-xs">false</code> for checkbox defaults.
                </p>
              )}
          </div>
        )}

        {sourceType === "manual_only" && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Values are entered manually in packet forms. Optional fallback value
            is used when seeding empty instances.
          </p>
        )}

        {sourceType === "packet_instance" && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            This field is intentionally supplied on a per-packet basis and does
            not derive its value from a global source.
          </p>
        )}

        {!sourceType && sourceStatus.status === "unmapped" && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Without an explicit source type, the resolver may still infer a value
            from the field key when possible. Select a source type above to
            configure an explicit mapping.
          </p>
        )}
      </div>
    </div>
  );
}
