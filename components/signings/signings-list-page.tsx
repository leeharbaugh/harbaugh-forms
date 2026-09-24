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
import {
  createDraftSigningAction,
  listSigningsAction,
} from "@/lib/signing/actions";
import type { SigningSummary } from "@/lib/signing/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

export function SigningsListPage() {
  const router = useRouter();
  const [signings, setSignings] = useState<SigningSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listSigningsAction();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setSignings(result.signings);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading Signings…</p>
      ) : signings.length === 0 ? (
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
