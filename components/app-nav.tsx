import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

type AppNavProps = {
  active:
    | "contacts"
    | "properties"
    | "forms"
    | "collections"
    | "packets"
    | "settings";
};

export function AppNav({ active }: AppNavProps) {
  const linkClass = (section: AppNavProps["active"]) =>
    section === active ? "font-medium text-foreground" : "text-muted-foreground";

  return (
    <nav className="border-b border-b-foreground/10">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5 text-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold">
            Harbaugh Forms
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/contacts" className={linkClass("contacts")}>
              Contacts
            </Link>
            <Link href="/properties" className={linkClass("properties")}>
              Properties
            </Link>
            <Link href="/forms" className={linkClass("forms")}>
              Forms
            </Link>
            <Link href="/collections" className={linkClass("collections")}>
              Collections
            </Link>
            <Link href="/" className={linkClass("packets")}>
              Packets
            </Link>
            <Link href="/settings" className={linkClass("settings")}>
              Settings
            </Link>
          </div>
        </div>
        {!hasEnvVars ? (
          <EnvVarWarning />
        ) : (
          <Suspense>
            <AuthButton />
          </Suspense>
        )}
      </div>
    </nav>
  );
}
