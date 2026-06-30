"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { downloadFilledPacketFormPdf } from "@/lib/packet-form-download";
import { createClient } from "@/lib/supabase/client";
import {
  formatAgreementReference,
  formatAgreementStatus,
  formatDate,
  getBuyerRepDetails,
  getOrderedContactNames,
} from "@/lib/types/buyer-rep-agreement";
import {
  type PacketForm,
  type PacketDetail,
  deletePacket,
  formatDateTime,
  formatPacketReference,
  formatPacketStatus,
  isPacketDeleted,
  PACKET_DETAIL_SELECT,
  restorePacket,
} from "@/lib/types/packet";
import { getOrderedPacketContactNames } from "@/lib/types/packet-contact";
import { formatCollectionType } from "@/lib/types/collection";
import { formatPropertyAddress, type Property } from "@/lib/types/property";
import { PacketFormsLiveEditor } from "@/components/packets/packet-forms-live-editor";
import { sortPacketForms } from "@/lib/types/packet-form";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const DELETE_DIALOG_MESSAGE =
  "Are you sure you want to delete this generated packet? This will hide the packet and its generated documents from normal use, but the records will remain in the database.";

type PacketDetailProps = {
  packetId: number;
};

export function PacketDetail({ packetId }: PacketDetailProps) {
  const [packet, setPacket] = useState<PacketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<
    number | null
  >(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadPacket = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("packets")
      .select(PACKET_DETAIL_SELECT)
      .eq("id", packetId)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setPacket(null);
    } else if (!data) {
      setLoadError("Generated packet not found.");
      setPacket(null);
    } else {
      setPacket(data as PacketDetail);
    }

    setIsLoading(false);
  }, [packetId]);

  useEffect(() => {
    void loadPacket();
  }, [loadPacket]);

  const downloadDocument = async (document: PacketForm) => {
    setDownloadError(null);
    setDownloadingDocumentId(document.id);

    try {
      const supabase = createClient();
      await downloadFilledPacketFormPdf(supabase, document);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Failed to download PDF.",
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const downloadAllDocuments = async (documentsToDownload: PacketForm[]) => {
    const downloadable = documentsToDownload.filter(
      (document) => document.storage_path,
    );

    if (downloadable.length === 0) {
      setDownloadError("No copied PDFs are available to download.");
      return;
    }

    setDownloadError(null);
    setIsDownloadingAll(true);

    try {
      const supabase = createClient();

      for (const document of downloadable) {
        await downloadFilledPacketFormPdf(supabase, document);
      }
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Failed to download PDFs.",
      );
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
    setActionError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setActionError(null);

    const supabase = createClient();

    try {
      await deletePacket(supabase, packetId);
      setDeleteDialogOpen(false);
      await loadPacket();
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete generated packet.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    setActionError(null);

    const supabase = createClient();

    try {
      await restorePacket(supabase, packetId);
      await loadPacket();
    } catch (restoreError) {
      setActionError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to restore generated packet.",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading generated packet...</p>
    );
  }

  if (loadError || !packet) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {loadError ?? "Generated packet not found."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/">Back to generated packets</Link>
        </Button>
      </div>
    );
  }

  const agreement = packet.representation_agreements;
  const buyerRepDetails = agreement ? getBuyerRepDetails(agreement) : null;
  const packetContactNames = getOrderedPacketContactNames(
    packet.packet_contacts ?? [],
  );
  const displayContactNames = agreement
    ? getOrderedContactNames(agreement)
    : packetContactNames;
  const isDeleted = isPacketDeleted(packet);
  const documents = sortPacketForms(
    [...(packet.packet_forms ?? [])].filter((document) =>
      isDeleted
        ? document.status === "ACTIVE" || document.status === "DELETED"
        : document.status === "ACTIVE",
    ),
  );

  const collectionFormIds = documents
    .filter((document) => document.origin === "collection" && document.form_id)
    .map((document) => document.form_id as number);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Generated Packet"
        message={DELETE_DIALOG_MESSAGE}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
        variant="destructive"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {packet.label}
            </h1>
            {isDeleted && (
              <Badge variant="destructive">
                {formatPacketStatus(packet.status)}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatPacketReference(packet.id)} · Created{" "}
            {formatDateTime(packet.create_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isDeleted && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/packets/${packetId}/edit`}>Edit packet</Link>
              </Button>
              <Button
                variant="destructive"
                onClick={openDeleteDialog}
                disabled={isDeleting || isRestoring}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </>
          )}
          {isDeleted && (
            <Button
              onClick={() => void handleRestore()}
              disabled={isDeleting || isRestoring}
            >
              {isRestoring ? "Restoring..." : "Restore"}
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/">Back to list</Link>
          </Button>
        </div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {isDeleted && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                This generated packet is hidden from normal use. PDF files
                remain in storage.
              </CardDescription>
            </div>
            <Button
              onClick={() => void handleRestore()}
              disabled={isDeleting || isRestoring}
            >
              {isRestoring ? "Restoring..." : "Restore"}
            </Button>
          </CardHeader>
          <CardContent>
            <Badge variant="destructive">
              {formatPacketStatus(packet.status)}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Packet overview</CardTitle>
          <CardDescription>
            {agreement
              ? "Generated from a collection and linked legacy representation agreement."
              : "Created from a collection with assigned contacts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Collection</p>
            <p className="text-sm text-muted-foreground">
              {packet.collections?.collection_name ?? "—"}
              {packet.collections?.collection_type
                ? ` (${formatCollectionType(packet.collections.collection_type)})`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Contacts</p>
            <p className="text-sm text-muted-foreground">
              {displayContactNames !== "Unnamed packet"
                ? displayContactNames
                : "—"}
            </p>
          </div>
          {packet.properties && (
            <div>
              <p className="text-sm font-medium">Property</p>
              <p className="text-sm text-muted-foreground">
                {formatPropertyAddress(packet.properties)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {agreement && (
        <Card>
          <CardHeader>
            <CardTitle>Legacy representation agreement</CardTitle>
            <CardDescription>
              This packet was generated from a legacy representation agreement
              record. New packets should be created from the Packets page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{getOrderedContactNames(agreement)}</p>
              <Badge variant="outline">
                {formatAgreementStatus(agreement.agreement_status)}
              </Badge>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <p>{formatAgreementReference(agreement.id)}</p>
              <p>Effective: {formatDate(agreement.effective_date)}</p>
              <p>Expiration: {formatDate(agreement.expiration_date)}</p>
              {buyerRepDetails && (
                <p>Market area: {buyerRepDetails.market_area}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Packet forms</CardTitle>
            <CardDescription>
              Collection defaults, optional internal forms, and external
              uploads. Use Fill form on internal template forms to edit field
              values and placement overrides for this packet.
            </CardDescription>
          </div>
          {!isDeleted &&
            documents.some((document) => document.storage_path) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void downloadAllDocuments(documents)}
                disabled={isDownloadingAll || downloadingDocumentId !== null}
              >
                {isDownloadingAll ? "Downloading..." : "Download all"}
              </Button>
            )}
        </CardHeader>
        <CardContent className="space-y-4">
          {downloadError && (
            <p className="text-sm text-destructive">{downloadError}</p>
          )}

          <PacketFormsLiveEditor
            packetId={packetId}
            forms={packet.packet_forms ?? []}
            collectionFormIds={collectionFormIds}
            disabled={isDeleted}
            onFormsChange={() => void loadPacket()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
