import { AuthButton } from "@/components/auth-button";
import { AdminNavLink } from "@/components/admin-nav-link";
import { ContactsNavLink } from "@/components/contacts-nav-link";
import { EnsureProfile } from "@/components/ensure-profile";
import { EnvVarWarning } from "@/components/env-var-warning";
import { navLinkClass } from "@/lib/ui/nav-styles";
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
    | "settings"
    | "admin";
};

export function AppNav({ active }: AppNavProps) {
  return (
    <>
      {hasEnvVars && <EnsureProfile />}
      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5 text-sm">
          <Link
            href="/"
            className="shrink-0 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Harbaugh Forms
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
            <Suspense fallback={null}>
              <ContactsNavLink
                className={navLinkClass(active === "contacts")}
                active={active === "contacts"}
              />
            </Suspense>
            <Link
              href="/properties"
              className={navLinkClass(active === "properties")}
              aria-current={active === "properties" ? "page" : undefined}
            >
              Properties
            </Link>
            <Link
              href="/forms"
              className={navLinkClass(active === "forms")}
              aria-current={active === "forms" ? "page" : undefined}
            >
              Forms
            </Link>
            <Link
              href="/collections"
              className={navLinkClass(active === "collections")}
              aria-current={active === "collections" ? "page" : undefined}
            >
              Collections
            </Link>
            <Link
              href="/"
              className={navLinkClass(active === "packets")}
              aria-current={active === "packets" ? "page" : undefined}
            >
              Packets
            </Link>
            <Link
              href="/settings"
              className={navLinkClass(active === "settings")}
              aria-current={active === "settings" ? "page" : undefined}
            >
              Settings
            </Link>
            <Suspense fallback={null}>
              <AdminNavLink
                className={navLinkClass(active === "admin")}
                active={active === "admin"}
              />
            </Suspense>
          </div>
          <div className="shrink-0">
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
