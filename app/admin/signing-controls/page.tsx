import { requireAppAdminPage } from "@/lib/admin/require-app-admin-page";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSigningWorkerControls } from "@/components/admin/admin-signing-worker-controls";
import { getSigningWorkerQueueSnapshot } from "@/lib/signing/admin-signing-worker";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { getSigningExternalAccessState } from "@/lib/signing/external-access";
import { isSigningWorkSuspended } from "@/lib/signing/work-suspension";
import { createAdminClient } from "@/lib/supabase/admin";
import { ListPageHeader } from "@/components/list-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Global Admin Native Signing control posture + recovery worker.
 * Does not grant business Signing management authority.
 */
export default async function AdminSigningControlsPage() {
  await requireAppAdminPage();

  const featureEnabled = isNativeSigningEnabled();
  let workSuspended: boolean | null = null;
  let accessSuspended: boolean | null = null;
  let loadError: string | null = null;
  let queue = null;

  try {
    const admin = createAdminClient();
    workSuspended = await isSigningWorkSuspended(admin);
    const access = await getSigningExternalAccessState(admin);
    accessSuspended = access.suspended;
    queue = await getSigningWorkerQueueSnapshot(admin);
  } catch {
    loadError =
      "Signing controls are unavailable (Signing may not be installed in this database).";
  }

  return (
    <div className="flex flex-col gap-6">
      <ListPageHeader
        title="Signing controls"
        description="System status for Global Admins. These settings are changed through trusted operations — not on this page."
      />
      <AdminSectionNav active="signing-controls" />
      <Card>
        <CardHeader>
          <CardTitle>Current posture</CardTitle>
          <CardDescription>
            Three independent controls. Changing them requires a trusted
            operational procedure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loadError ? (
            <p className="text-muted-foreground">{loadError}</p>
          ) : null}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Signings enabled</span>
              <Badge variant={featureEnabled ? "success" : "secondary"}>
                {featureEnabled ? "Yes" : "No"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Whether Signings are available to users in this environment.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Work suspended</span>
              <Badge
                variant={
                  workSuspended === true
                    ? "warning"
                    : workSuspended === false
                      ? "success"
                      : "outline"
                }
              >
                {workSuspended === null
                  ? "Unknown"
                  : workSuspended
                    ? "Yes"
                    : "No"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When Yes, background Signing jobs such as finalizing signed
              documents and sending Signing-related emails are paused. Existing
              Signing data is preserved.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Access suspended</span>
              <Badge
                variant={
                  accessSuspended === true
                    ? "warning"
                    : accessSuspended === false
                      ? "success"
                      : "outline"
                }
              >
                {accessSuspended === null
                  ? "Unknown"
                  : accessSuspended
                    ? "Yes"
                    : "No"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When Yes, participants cannot use Signing links or active Signing
              sessions. This is an emergency or recovery security control.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Worker recovery</CardTitle>
          <CardDescription>
            Harbaugh Forms normally processes signing work immediately. A
            recovery job checks every 2 minutes for anything that did not
            finish. If something appears stuck, a Global Admin can run the
            worker manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminSigningWorkerControls initialQueue={queue} />
        </CardContent>
      </Card>
    </div>
  );
}
