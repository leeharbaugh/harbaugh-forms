import { FragmentExchangeBootstrap } from "@/components/sign/fragment-exchange-bootstrap";
import { isSigningCredentialPublicId } from "@/lib/signing/bearer-transport";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";

/**
 * Completed-package landing: path holds nonsecret public credential id.
 */
export default async function CompletedPackageLandingPage({
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

  return (
    <FragmentExchangeBootstrap publicId={publicId} kind="completed-package" />
  );
}
