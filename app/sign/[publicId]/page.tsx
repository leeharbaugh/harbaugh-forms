import { FragmentExchangeBootstrap } from "@/components/sign/fragment-exchange-bootstrap";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isSigningCredentialPublicId } from "@/lib/signing/bearer-transport";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";

/**
 * Participant invitation landing: path holds nonsecret public credential id.
 * Fragment secret is exchanged client-side via POST (never logged as request path).
 */
export default async function SignEntryLandingPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  if (!isNativeSigningEnabled()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <p className="text-sm text-muted-foreground">
          {SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE}
        </p>
      </main>
    );
  }

  const { publicId } = await params;
  if (!isSigningCredentialPublicId(publicId)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <p className="text-sm text-muted-foreground">
          {SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE}
        </p>
      </main>
    );
  }

  return <FragmentExchangeBootstrap publicId={publicId} kind="entry" />;
}
