"use client";

import { Button } from "@/components/ui/button";
import { affirmIdentityAction } from "@/lib/signing/ceremony-actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * "I am [Name]" — the identity affirmation that starts the ceremony.
 *
 * The server creates the ceremony browser session, begins presence, and retires
 * the pre-ceremony entry credential; this only reports failure and routes to
 * the ceremony.
 */
export function AffirmIdentityButton({
  participantFullName,
}: {
  participantFullName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function affirm() {
    setError(null);
    startTransition(async () => {
      const result = await affirmIdentityAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/sign/ceremony");
    });
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="h-10 w-full"
        onClick={affirm}
        disabled={pending}
        aria-describedby={error ? "affirm-identity-error" : undefined}
      >
        {pending ? "Starting…" : `I am ${participantFullName}`}
      </Button>
      {error ? (
        <p
          id="affirm-identity-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
