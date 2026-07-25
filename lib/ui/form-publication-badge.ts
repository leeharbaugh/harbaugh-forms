import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import {
  formatFormPublicationBadge,
  isFormDraft,
  isFormPublished,
  isFormRetired,
  type FormLifecycleSnapshot,
} from "@/lib/types/form-lifecycle";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function formPublicationBadgeVariant(
  form: FormLifecycleSnapshot,
): BadgeVariant {
  if (isFormRetired(form)) {
    return "outline";
  }
  if (isFormPublished(form)) {
    return "success";
  }
  if (isFormDraft(form)) {
    return "secondary";
  }
  return "outline";
}

export function formPublicationBadgeLabel(form: FormLifecycleSnapshot): string {
  return formatFormPublicationBadge(form);
}
