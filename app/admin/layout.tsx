import { AppNav } from "@/components/app-nav";
import { requireAppAdminPage } from "@/lib/admin/require-app-admin-page";
import { Suspense } from "react";

async function AdminAuthorizedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAppAdminPage();
  return (
    <div className="mx-auto flex max-w-5xl flex-col px-5 py-8">{children}</div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="admin" />
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-5 py-8 text-sm text-muted-foreground">
            Checking administrator access…
          </div>
        }
      >
        <AdminAuthorizedShell>{children}</AdminAuthorizedShell>
      </Suspense>
    </main>
  );
}
