import { AuthBrand } from "@/components/auth-brand";

/** Shared centered shell for authentication screens. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <AuthBrand />
        {children}
      </div>
    </div>
  );
}
