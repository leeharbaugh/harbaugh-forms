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
 * Global Admin Native Signing control posture + technical worker sweep.
 * Does not grant business Signing management authority.
 */
export default async function AdminSigningControlsPage() {
  await requireAppAdminPage();

  const featureEnabled = isNativeSigningEnabled();
  let workSuspended: boolean | null = null;
  let accessSuspended: boolean | null = null;
  let controlsPresent = false;
  let loadError: string | null = null;
  let queue = null;

  try {
    const admin = createAdminClient();
    workSuspended = await isSigningWorkSuspended(admin);
    const access = await getSigningExternalAccessState(admin);
    accessSuspended = access.suspended;
    controlsPresent = true;
    queue = await getSigningWorkerQueueSnapshot(admin);
  } catch {
    loadError =
      "Native Signing controls are unavailable (schema may be uninstalled).";
  }

  return (
    <div className="flex flex-col gap-6">
      <ListPageHeader
        title="Native Signing controls"
        description="Operational posture for Global Admins. Suspension toggles are not available here. Run Worker is a system recovery action only."
      />
      <AdminSectionNav active="signing-controls" />
      <Card>
        <CardHeader>
          <CardTitle>Current posture</CardTitle>
          <CardDescription>
            Feature, work, and access controls remain independent. Changing them
            requires trusted operational procedures — not this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loadError ? (
            <p className="text-muted-foreground">{loadError}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span>Feature gate</span>
            <Badge variant={featureEnabled ? "success" : "secondary"}>
              {featureEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Work suspended</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <span>Access suspended</span>
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
            Controls row present: {controlsPresent ? "yes" : "no"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Worker recovery</CardTitle>
          <CardDescription>
            Uses the same bounded batch processor as Cron. Does not select
            arbitrary Signings or bypass feature/work suspension.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminSigningWorkerControls initialQueue={queue} />
        </CardContent>
      </Card>
    </div>
  );
}
