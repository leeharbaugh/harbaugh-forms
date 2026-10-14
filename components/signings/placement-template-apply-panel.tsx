"use client";

import { Button } from "@/components/ui/button";
import {
  applyPlacementTemplateAction,
  getPlacementTemplateApplyPreviewAction,
} from "@/lib/signing/placement-template-actions";
import {
  placementCountLabel,
  type PlacementTemplateApplyPreview,
  type PlacementTemplateApplyResult,
} from "@/lib/signing/placement-template-model";
import { useCallback, useEffect, useId, useState } from "react";

type AvailablePreview = Extract<PlacementTemplateApplyPreview, { available: true }>;

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Explicit, manager-confirmed application of the document's placement
 * template. Nothing is applied until the manager reviews the slot mapping and
 * confirms; existing placements are never removed or replaced.
 */
export function PlacementTemplateApplyPanel({
  signingId,
  documentId,
  saving,
  onApplied,
}: {
  signingId: string;
  documentId: string;
  /** Placement writes are still being saved; apply waits for them. */
  saving: boolean;
  onApplied: () => Promise<void>;
}) {
  const titleId = useId();
  const [preview, setPreview] = useState<AvailablePreview | null>(null);
  const [review, setReview] = useState<{ preview: AvailablePreview; requestId: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPreview = useCallback(async (): Promise<AvailablePreview | null> => {
    const result = await getPlacementTemplateApplyPreviewAction({
      signingId,
      signingDocumentId: documentId,
    });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    const data = result.data as PlacementTemplateApplyPreview;
    return data.available ? data : null;
  }, [signingId, documentId]);

  useEffect(() => {
    let cancelled = false;
    void loadPreview().then((next) => {
      if (!cancelled) setPreview(next);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPreview]);

  if (!preview && !notice) return null;

  async function openReview() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const fresh = await loadPreview();
    setPreview(fresh);
    setBusy(false);
    if (!fresh) {
      setError("No placement template applies to this document any more.");
      return;
    }
    setReview({ preview: fresh, requestId: newRequestId() });
  }

  async function confirmApply() {
    if (!review || busy) return;
    setBusy(true);
    setError(null);
    const result = await applyPlacementTemplateAction({
      signingId,
      signingDocumentId: documentId,
      templateId: review.preview.templateId,
      requestId: review.requestId,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    const applied = result.data as PlacementTemplateApplyResult;
    setReview(null);
    setNotice(
      `Added ${placementCountLabel(applied.created)} from ${review.preview.sourceLabel}.${
        applied.skipped > 0
          ? ` ${placementCountLabel(applied.skipped)} ${applied.skipped === 1 ? "was" : "were"} not added because ${applied.skipped === 1 ? "its signer slot has" : "their signer slots have"} no matching participant.`
          : ""
      } Every placement can now be edited like any other.`,
    );
    await onApplied();
    setPreview(await loadPreview());
    setBusy(false);
  }

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="placement-template-panel">
      {preview ? (
        <>
          <p className="text-sm font-medium">Placement template available</p>
          <p className="text-xs text-muted-foreground" data-testid="placement-template-source">
            {preview.sourceLabel} · {preview.placementCountLabel}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || saving}
            onClick={() => void openReview()}
            data-testid="placement-template-review"
          >
            Apply placement template…
          </Button>
        </>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-emerald-700" role="status" data-testid="placement-template-notice">
          {notice}
        </p>
      ) : null}

      {review ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="placement-template-apply-dialog"
        >
          <div className="w-full max-w-lg space-y-3 rounded-lg border bg-background p-5 shadow-lg">
            <h3 id={titleId} className="text-base font-semibold">
              Apply placement template
            </h3>
            <p className="text-sm text-muted-foreground">
              {review.preview.sourceLabel} · {review.preview.placementCountLabel}. Signer
              slots match participants by role and the order shown on this Signing.
            </p>
            <ul className="space-y-1 text-sm" data-testid="placement-template-mapping">
              {review.preview.slots.map((slot) => (
                <li key={slot.slotKey} data-slot={slot.slotKey}>
                  {slot.participantName ? (
                    <>
                      <span className="font-medium">{slot.label}</span> →{" "}
                      {slot.participantName} ({placementCountLabel(slot.placementCount)})
                    </>
                  ) : (
                    <span className="text-amber-800" data-testid="placement-template-unresolved">
                      {slot.notice}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {review.preview.existingPlacementCount > 0 ? (
              <p className="text-sm text-amber-800" data-testid="placement-template-existing">
                This document already has{" "}
                {placementCountLabel(review.preview.existingPlacementCount)}. Applying adds
                the template&apos;s placements alongside them; nothing is removed or replaced.
              </p>
            ) : null}
            <p className="text-sm" data-testid="placement-template-summary">
              {review.preview.applicableCount > 0
                ? `${placementCountLabel(review.preview.applicableCount)} will be added as ordinary Draft placements.`
                : "No placements can be added: no signer slot has a matching participant."}
            </p>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || review.preview.applicableCount === 0}
                onClick={() => void confirmApply()}
                data-testid="placement-template-apply"
              >
                {review.preview.skippedCount > 0
                  ? "Apply available placements"
                  : "Apply placements"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
