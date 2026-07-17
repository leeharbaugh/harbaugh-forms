import type { DocumentState } from "@/lib/types/packet";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export const PACKET_FORM_DOCUMENT_STATES = [
  "DRAFT",
  "FINAL",
  "SIGNED",
  "VOID",
] as const satisfies readonly DocumentState[];

export type PacketFormLifecycleTransition =
  | { from: "DRAFT"; to: "FINAL" }
  | { from: "FINAL"; to: "DRAFT" };

export function formatPacketFormDocumentState(
  state: DocumentState | string | null | undefined,
): string {
  switch (state) {
    case "DRAFT":
      return "Draft";
    case "FINAL":
      return "Final";
    case "SIGNED":
      return "Signed";
    case "VOID":
      return "Void";
    default:
      return state?.trim() || "—";
  }
}

export function packetFormDocumentStateVariant(
  state: DocumentState | string | null | undefined,
): BadgeVariant {
  switch (state) {
    case "DRAFT":
      return "secondary";
    case "FINAL":
      return "info";
    case "SIGNED":
      return "success";
    case "VOID":
      return "destructive";
    default:
      return "outline";
  }
}

export function isPacketFormValueEditable(
  documentState: DocumentState | string | null | undefined,
  rowStatus: string | null | undefined = "ACTIVE",
): boolean {
  return rowStatus === "ACTIVE" && documentState === "DRAFT";
}

export function canRefreshPacketFormValues(
  documentState: DocumentState | string | null | undefined,
  rowStatus: string | null | undefined = "ACTIVE",
): boolean {
  return isPacketFormValueEditable(documentState, rowStatus);
}

export function canMarkPacketFormFinal(
  documentState: DocumentState | string | null | undefined,
  rowStatus: string | null | undefined = "ACTIVE",
): boolean {
  return rowStatus === "ACTIVE" && documentState === "DRAFT";
}

export function canReopenPacketFormToDraft(
  documentState: DocumentState | string | null | undefined,
  rowStatus: string | null | undefined = "ACTIVE",
): boolean {
  return rowStatus === "ACTIVE" && documentState === "FINAL";
}

export function isValidPacketFormLifecycleTransition(
  from: DocumentState | string,
  to: DocumentState | string,
): boolean {
  return (
    (from === "DRAFT" && to === "FINAL") || (from === "FINAL" && to === "DRAFT")
  );
}

export function packetFormLifecycleBlockedMessage(
  documentState: DocumentState | string | null | undefined,
): string {
  switch (documentState) {
    case "FINAL":
      return "This form is Final. Reopen it as a Draft to edit or refresh values.";
    case "SIGNED":
      return "This form is Signed and cannot be edited or refreshed.";
    case "VOID":
      return "This form is Void and cannot be edited or refreshed.";
    default:
      return "This form is not editable.";
  }
}

export const REFRESH_VALUES_HELP_TEXT =
  "Recalculates non-override fields from the packet’s current contacts, property, agreement data, and defaults. Manual overrides are preserved. Available only while this form is a Draft.";

export const REFRESH_VALUES_CONFIRM_TITLE =
  "Refresh values from current sources?";

export const REFRESH_VALUES_CONFIRM_MESSAGE =
  "Non-override fields will be recalculated from the packet’s current linked data and defaults. Fields you manually changed will remain unchanged. This cannot be undone automatically.";

export const MARK_FINAL_CONFIRM_TITLE = "Mark this form Final?";

export const MARK_FINAL_CONFIRM_MESSAGE =
  "This locks the form’s current values and prevents editing or refreshing. You can still download it. If changes are needed later, you can deliberately reopen it as a Draft.";

export const REOPEN_DRAFT_CONFIRM_TITLE = "Reopen this form as a Draft?";

export const REOPEN_DRAFT_CONFIRM_MESSAGE =
  "This unlocks the form for editing and makes Refresh Values available again. Existing values will not change merely because the form is reopened.";
