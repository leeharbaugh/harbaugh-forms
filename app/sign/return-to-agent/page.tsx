import { ReturnToAgentForm } from "@/components/sign/return-to-agent-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DEVICE_HANDOFF_LOCK_COOKIE_NAME,
  validateDeviceHandoffLock,
} from "@/lib/signing/device-handoff-lock";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Return to agent | Harbaugh Forms",
  description: "Unlock the agent workspace after in-person signing",
};

export const instant = false;

/**
 * Shared-device boundary after in-person ceremony.
 *
 * No document content. Unlock restores agent workspace access only.
 */
export default async function ReturnToAgentPage() {
  await connection();

  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const cookieStore = await cookies();
  const rawLockToken = cookieStore.get(DEVICE_HANDOFF_LOCK_COOKIE_NAME)?.value;
  if (!rawLockToken) {
    notFound();
  }

  const admin = createAdminClient();
  const lock = await validateDeviceHandoffLock(admin, rawLockToken);
  if (!lock) {
    notFound();
  }

  const redirectPath = `/signings/${lock.signingId}`;

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return to agent workspace</CardTitle>
          <CardDescription>
            This device is in participant handoff mode. Participant signing is
            separate from unlocking the agent workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReturnToAgentForm
            signingId={lock.signingId}
            redirectPath={redirectPath}
          />
        </CardContent>
      </Card>
    </main>
  );
}
