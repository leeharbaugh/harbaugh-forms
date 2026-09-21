"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runSigningWorkerNowAction } from "@/lib/signing/admin-signing-worker-actions";
import type { SigningWorkerQueueSnapshot } from "@/lib/signing/admin-signing-worker";

export function AdminSigningWorkerControls({
  initialQueue,
}: {
  initialQueue: SigningWorkerQueueSnapshot | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queue, setQueue] = useState(initialQueue);

  function run() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await runSigningWorkerNowAction();
      if (!result.ok) {
        setError(result.error ?? "Unable to run Signing worker.");
        return;
      }
      if (result.queue) setQueue(result.queue);
      const types =
        result.workTypes && result.workTypes.length > 0
          ? result.workTypes.join(", ")
          : "none";
      setNotice(
        `Status ${result.status}. Processed ${result.processedCount ?? 0} (${types}).${
          result.detail ? ` ${result.detail}` : ""
        }`,
      );
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Cron recovery sweep: every 2 minutes. Request-driven kicks remain the
        primary latency path.
      </p>
      {queue ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>Pending: {queue.pendingCount}</li>
          <li>Failed (retryable): {queue.failedCount}</li>
          <li>Processing: {queue.processingCount}</li>
          <li>
            Oldest pending age:{" "}
            {queue.oldestPendingAgeSeconds == null
              ? "n/a"
              : `${queue.oldestPendingAgeSeconds}s`}
          </li>
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Queue snapshot unavailable.
        </p>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <Button type="button" size="sm" disabled={pending} onClick={run}>
        {pending ? "Running…" : "Run Signing Worker Now"}
      </Button>
    </div>
  );
}
