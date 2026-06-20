import { AppNav } from "@/components/app-nav";
import { FormsSectionLayout } from "@/components/forms/forms-section-layout";
import { Suspense } from "react";

export default function FormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="forms" />
      <Suspense>
        <FormsSectionLayout>{children}</FormsSectionLayout>
      </Suspense>
    </main>
  );
}
