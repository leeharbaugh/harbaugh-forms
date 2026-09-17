"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockDeviceHandoffLockAction } from "@/lib/signing/ceremony-agent-actions";
import { useState, useTransition } from "react";

export function ReturnToAgentForm({
  signingId,
  redirectPath,
}: {
  signingId: string | null;
  redirectPath: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await unlockDeviceHandoffLockAction({ password });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          // Replace so Back cannot return to the locked Return-to-Agent screen
          // or a prior workspace history entry from before handoff.
          window.location.replace(redirectPath);
        });
      }}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="agent-unlock-password">Your password</Label>
        <Input
          id="agent-unlock-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Re-enter your password to return to the agent workspace. This does not
          complete or finalize the Signing.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={pending || !password}>
        Return to Agent Workspace
      </Button>
      {signingId ? (
        <p className="text-xs text-muted-foreground">
          After unlock you will return to Signing {signingId.slice(0, 8)}…
        </p>
      ) : null}
    </form>
  );
}
