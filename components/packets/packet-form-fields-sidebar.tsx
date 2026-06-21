"use client";

import { PacketFormFieldValueInput } from "@/components/packets/packet-form-field-value-input";
import { Button } from "@/components/ui/button";
import {
  getDirtyFieldInstanceIds,
  isManualFieldValueOverride,
  packetFieldSidebarLabel,
  type PacketFormFieldView,
} from "@/lib/types/packet-form-editor";
import { cn } from "@/lib/utils";

type PacketFormFieldsSidebarProps = {
  fields: PacketFormFieldView[];
  draftValuesByInstanceId: Record<string, string>;
  savedValuesByInstanceId: Record<string, string>;
  selectedMappingId: string | null;
  isSaving: boolean;
  isResettingPlacementId: string | null;
  isRevertingInstanceId: string | null;
  saveError: string | null;
  onDraftChange: (instanceId: string, value: string) => void;
  onSelectField: (fieldView: PacketFormFieldView) => void;
  onSaveChanges: () => void;
  onResetPlacement: (fieldView: PacketFormFieldView) => void;
  onRevertToDefault: (fieldView: PacketFormFieldView) => void;
  itemRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
};

export function PacketFormFieldsSidebar({
  fields,
  draftValuesByInstanceId,
  savedValuesByInstanceId,
  selectedMappingId,
  isSaving,
  isResettingPlacementId,
  isRevertingInstanceId,
  saveError,
  onDraftChange,
  onSelectField,
  onSaveChanges,
  onResetPlacement,
  onRevertToDefault,
  itemRefs,
}: PacketFormFieldsSidebarProps) {
  const dirtyInstanceIds = getDirtyFieldInstanceIds(
    draftValuesByInstanceId,
    savedValuesByInstanceId,
  );
  const hasUnsavedChanges = dirtyInstanceIds.length > 0;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-l bg-card">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Field values</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {fields.length} field{fields.length === 1 ? "" : "s"} on this
              form. Edit values below, then save.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={onSaveChanges}
        >
          {isSaving
            ? "Saving..."
            : hasUnsavedChanges
              ? `Save changes (${dirtyInstanceIds.length})`
              : "Save changes"}
        </Button>
        {saveError && (
          <p className="mt-2 text-xs text-destructive">{saveError}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No template placements found for this form.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {fields.map((fieldView) => {
              const field = fieldView.instance.fields;
              const isSelected = selectedMappingId === fieldView.mapping.id;
              const label = packetFieldSidebarLabel(fieldView);
              const instanceId = fieldView.instance.id;
              const draftValue = draftValuesByInstanceId[instanceId] ?? "";
              const isDirty = dirtyInstanceIds.includes(instanceId);
              const isResetting =
                isResettingPlacementId === fieldView.mapping.id;
              const isReverting = isRevertingInstanceId === instanceId;
              const showRevert = isManualFieldValueOverride(fieldView.instance);

              return (
                <div
                  key={fieldView.mapping.id}
                  ref={(element) => {
                    itemRefs.current[fieldView.mapping.id] = element;
                  }}
                  className={cn(
                    "flex flex-col gap-2 p-3 text-sm transition-colors",
                    isSelected && "bg-amber-50 dark:bg-amber-950/20",
                    isDirty &&
                      "border-l-2 border-l-sky-500 pl-[calc(0.75rem-2px)]",
                  )}
                >
                  <button
                    type="button"
                    className="flex flex-col gap-1 text-left"
                    onClick={() => onSelectField(fieldView)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label}</span>
                      {isDirty && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-900">
                          Unsaved
                        </span>
                      )}
                      {!isDirty && fieldView.instance.is_override && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900">
                          Manual
                        </span>
                      )}
                      {fieldView.hasPlacementOverride && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                          Moved
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {field?.field_key ?? "—"} · Page{" "}
                      {fieldView.placement.page_number}
                    </p>
                  </button>

                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <PacketFormFieldValueInput
                      fieldView={fieldView}
                      value={draftValue}
                      onChange={(nextValue) =>
                        onDraftChange(instanceId, nextValue)
                      }
                      disabled={isSaving || isReverting}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {showRevert && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-fit px-2 text-xs"
                        disabled={isSaving || isReverting}
                        onClick={() => onRevertToDefault(fieldView)}
                      >
                        {isReverting
                          ? "Reverting..."
                          : "Revert to default"}
                      </Button>
                    )}

                    {fieldView.hasPlacementOverride && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-fit px-2 text-xs"
                        disabled={isSaving || isResetting || isReverting}
                        onClick={() => onResetPlacement(fieldView)}
                      >
                        {isResetting
                          ? "Resetting placement..."
                          : "Reset placement to template"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
