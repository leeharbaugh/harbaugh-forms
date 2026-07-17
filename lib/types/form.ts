export type FormCategory =
  | "REPRESENTATION"
  | "DISCLOSURE"
  | "ADDENDUM"
  | "CONTRACT"
  | "OTHER";

export type VisibilityScope = "GLOBAL" | "PRIVATE" | "ORGANIZATION";

export type Form = {
  id: number;
  form_code: string;
  form_name: string;
  form_category: FormCategory;
  state_code: string;
  version_label: string | null;
  source_storage_path: string;
  description: string | null;
  create_date: string;
  update_date: string;
  status: string;
  scope: VisibilityScope;
  owner_user_id: string | null;
  organization_id: string | null;
  copied_from_form_id?: number | null;
  copied_from_owner_user_id?: string | null;
  copied_by_user_id?: string | null;
  copied_to_global_at?: string | null;
};

export type FormInput = {
  form_name: string;
  form_code: string;
  form_category: FormCategory;
  state_code: string;
  version_label: string;
  description: string;
};

export const FORM_CATEGORIES: FormCategory[] = [
  "REPRESENTATION",
  "DISCLOSURE",
  "ADDENDUM",
  "CONTRACT",
  "OTHER",
];

export const emptyFormInput = (): FormInput => ({
  form_name: "",
  form_code: "",
  form_category: "OTHER",
  state_code: "TX",
  version_label: "",
  description: "",
});

export function formToInput(form: Form): FormInput {
  return {
    form_name: form.form_name,
    form_code: form.form_code,
    form_category: form.form_category,
    state_code: form.state_code ?? "TX",
    version_label: form.version_label ?? "",
    description: form.description ?? "",
  };
}

export function formatFormReference(id: number): string {
  return `#${id}`;
}

export function formatFormCategory(category: FormCategory): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

export function deriveFormCode(formName: string): string {
  const slug = formName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (slug || "FORM").slice(0, 50);
}

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export function validateFormInput(
  input: FormInput,
  options: {
    mode: "create" | "edit";
    pdfFile: File | null;
    replacePdf: boolean;
    existingStoragePath: string | null;
  },
): string | null {
  if (!input.form_name.trim()) {
    return "Form name is required.";
  }

  if (!input.form_category) {
    return "Form category is required.";
  }

  if (!input.state_code.trim()) {
    return "State code is required.";
  }

  if (options.mode === "create") {
    if (!options.pdfFile) {
      return "A PDF file is required when creating a form.";
    }
    if (!isPdfFile(options.pdfFile)) {
      return "Only PDF files are allowed.";
    }
  }

  if (options.mode === "edit") {
    if (options.replacePdf) {
      if (!options.pdfFile) {
        return "Select a PDF file to replace the current form.";
      }
      if (!isPdfFile(options.pdfFile)) {
        return "Only PDF files are allowed.";
      }
    } else if (!options.existingStoragePath?.trim()) {
      return "A stored PDF is required for this form.";
    }
  }

  return null;
}

export function normalizeFormInput(input: FormInput) {
  const trim = (value: string) => value.trim();
  const formCode = trim(input.form_code);

  return {
    form_name: trim(input.form_name),
    form_code: formCode || deriveFormCode(input.form_name),
    form_category: input.form_category,
    state_code: trim(input.state_code) || "TX",
    version_label: trim(input.version_label) || null,
    description: trim(input.description) || null,
  };
}
