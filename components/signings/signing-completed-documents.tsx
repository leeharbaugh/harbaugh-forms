"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  CombinedPackageState,
  ManagerCompletedArtifact,
} from "@/lib/signing/completed-documents";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

/** pdf.js needs browser APIs (DOMMatrix, canvas, workers): never load it on the server. */
const CompletedDocumentViewer = dynamic(
  () =>
    import("@/components/signings/completed-document-viewer").then(
      (module) => module.CompletedDocumentViewer,
    ),
  { ssr: false },
);

export function completedArtifactUrl(
  signingId: string,
  artifactId: string,
  download: boolean,
): string {
  const base = `/signings/${encodeURIComponent(signingId)}/completed/${encodeURIComponent(artifactId)}`;
  return download ? `${base}?download=1` : base;
}

/** View / Download for a Complete Signing's immutable signed documents. */
export function SigningCompletedDocuments({
  signingId,
  artifacts,
  combinedPackage = null,
}: {
  signingId: string;
  artifacts: ManagerCompletedArtifact[];
  combinedPackage?: CombinedPackageState | null;
}) {
  const [viewing, setViewing] = useState<ManagerCompletedArtifact | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const documents = artifacts.filter((artifact) => artifact.kind === "DOCUMENT");
  const extras = artifacts.filter((artifact) => artifact.kind !== "DOCUMENT");

  function row(artifact: ManagerCompletedArtifact) {
    return (
      <li
        key={artifact.artifactId}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
        data-completed-artifact={artifact.kind}
        data-artifact-label={artifact.label}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{artifact.label}</p>
          {artifact.pageCount ? (
            <p className="text-xs text-muted-foreground">
              {artifact.pageCount} {artifact.pageCount === 1 ? "page" : "pages"}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`View ${artifact.label}`}
          onClick={(event) => {
            returnFocusRef.current = event.currentTarget;
            setViewing(artifact);
          }}
        >
          View
        </Button>
        <Button asChild size="sm" variant="outline">
          <a
            href={completedArtifactUrl(signingId, artifact.artifactId, true)}
            download
            aria-label={`Download ${artifact.label}`}
          >
            Download
          </a>
        </Button>
      </li>
    );
  }

  return (
    <Card data-testid="completed-documents">
      <CardHeader>
        <CardTitle>Completed documents</CardTitle>
        <CardDescription>
          The final signed documents produced when this Signing completed. They
          never change, even if Contacts, Packets or this Signing&apos;s name change later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {artifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed documents are available for this Signing.
          </p>
        ) : (
          <>
            <ul className="space-y-2">{documents.map(row)}</ul>
            {extras.length > 0 || combinedPackage === "PREPARING" ? (
              <ul className="space-y-2">
                {extras.map(row)}
                {combinedPackage === "PREPARING" ? (
                  <li
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3"
                    data-completed-artifact-pending="COMBINED"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">Combined signed package</p>
                      <p className="text-xs text-muted-foreground" role="status">
                        Preparing… It will appear here when ready.
                      </p>
                    </div>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
      {viewing ? (
        <CompletedDocumentViewer
          label={viewing.label}
          viewUrl={completedArtifactUrl(signingId, viewing.artifactId, false)}
          downloadUrl={completedArtifactUrl(signingId, viewing.artifactId, true)}
          onClose={() => {
            setViewing(null);
            returnFocusRef.current?.focus();
          }}
        />
      ) : null}
    </Card>
  );
}
