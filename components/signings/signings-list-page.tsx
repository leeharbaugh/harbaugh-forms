"use client";

import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHistoryRestoreRefresh } from "@/components/signings/use-history-restore-refresh";
import {
  createDraftSigningAction,
  listSigningsAction,
  type SigningListActionResult,
} from "@/lib/signing/actions";
import type { SigningSummary } from "@/lib/signing/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function lifecycleVariant(
  state: string,
): "outline" | "info" | "success" | "warning" | "destructive" {
  switch (state) {
    case "DRAFT":
      return "outline";
    case "IN_PROGRESS":
      return "info";
    case "COMPLETE":
      return "success";
    case "DECLINED":
      return "warning";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export function SigningsListPage({
  initial,
}: {
  /** Rendered by the page request. */
  initial: SigningListActionResult;
}) {
  const router = useRouter();
  const [served, setServed] = useState(initial);
  const [signings, setSignings] = useState<SigningSummary[]>(
    initial.ok ? initial.signings : [],
  );
  const [error, setError] = useState<string | null>(
    initial.ok ? null : initial.error,
  );
  const [title, setTitle] = useState("DEV QA Test Signing");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const result = await listSigningsAction();
    if (!result.ok) {
      setError(result.error);
      setSignings([]);
      return;
    }
    setError(null);
    setSignings(result.signings);
  }, []);

  // A push navigation back to this preserved route re-renders the page on the
  // server; adopt that payload instead of the list kept from the last visit.
  if (served !== initial) {
    setServed(initial);
    setSignings(initial.ok ? initial.signings : []);
    setError(initial.ok ? null : initial.error);
  }
  useHistoryRestoreRefresh(reload);

  async function createDraft() {
    setCreating(true);
    setError(null);
    const result = await createDraftSigningAction({ title });
    if (!result.ok) {
      setError(result.error);
      setCreating(false);
      return;
    }
    await reload();
    setCreating(false);
    router.push(`/signings/${result.signing.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <ListPageHeader
        title="Signings"
        description="Prepare Draft Signings, send invitations, or begin in-person signing."
      />

      <Card>
        <CardHeader>
          <CardTitle>Create Signing</CardTitle>
          <CardDescription>
            Creates a Draft you can prepare with documents, participants, and
            fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="signing-title">Title</Label>
            <Input
              id="signing-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              disabled={creating}
            />
          </div>
          <Button
            type="button"
            disabled={creating || title.trim().length === 0}
            onClick={() => void createDraft()}
          >
            {creating ? "Creating…" : "Create Signing"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {signings.length === 0 ? (
        <ListEmptyState
          title="No Signings yet"
          description="Create a Draft Signing to begin preparation."
        />
      ) : (
        <div className="space-y-2">
          {signings.map((signing) => (
            <Link
              key={signing.id}
              href={`/signings/${signing.id}`}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{signing.title}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(signing.updateDate).toLocaleString()}
                </p>
              </div>
              <Badge variant={lifecycleVariant(signing.lifecycleState)}>
                {signing.lifecycleState.replace(/_/g, " ")}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
