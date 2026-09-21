import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import Link from "next/link";

/**
 * Top-nav entry for manager-facing Native Signing.
 * Renders only when the server-side feature gate is enabled.
 */
export async function SigningsNavLink({
  className,
  active = false,
}: {
  className?: string;
  active?: boolean;
}) {
  if (!isNativeSigningEnabled()) {
    return null;
  }

  return (
    <Link
      href="/signings"
      className={className}
      aria-current={active ? "page" : undefined}
    >
      Signings
    </Link>
  );
}
