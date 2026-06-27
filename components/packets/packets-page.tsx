"use client";

import { CreatePacketWizard } from "@/components/packets/create-packet-wizard";
import { ListRowActions } from "@/components/list-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  type PacketListItem,
  deletePacket,
  formatDateTime,
  formatPacketReference,
  formatRelatedAgreementLabel,
  getActivePacketFormCount,
  isPacketDeleted,
  restorePacket,
} from "@/lib/types/packet";
import {
  isPacketWorkflowType,
  type PacketWorkflowType,
} from "@/lib/types/packet-workflow";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const LIST_COLUMNS =
  "grid grid-cols-[minmax(0,0.5fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.6fr)] gap-3";

const GENERATED_PACKET_LIST_SELECT = `
  *,
  collections(
    id,
    collection_name,
    collection_type
  ),
  representation_agreements(
    id,
    agreement_type,
    effective_date,
    agreement_status,
    representation_agreement_clients(
      sort_order,
      status,
      contacts(*)
    )
  ),
  packet_forms(
    id,
    status
  )
`;

const DELETE_DIALOG_MESSAGE =
  "Are you sure you want to delete this generated packet? This will hide the packet and its generated documents from normal use, but the records will remain in the database.";

function PacketsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createParam = searchParams.get("create");
  const isCreateFlow = createParam !== null;
  const initialWorkflowType = isPacketWorkflowType(createParam)
    ? createParam
    : null;

  const [packets, setPackets] = useState<PacketListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoringPacketId, setRestoringPacketId] = useState<number | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [packetPendingDelete, setPacketPendingDelete] =
    useState<PacketListItem | null>(null);

  const closeCreateFlow = useCallback(() => {
    router.push("/");
  }, [router]);

  const openCreateFlow = useCallback(() => {
    router.push("/?create");
  }, [router]);

  const selectCreateWorkflow = useCallback(
    (type: PacketWorkflowType) => {
      router.push(`/?create=${type}`);
    },
    [router],
  );

  const loadPackets = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("packets")
      .select(GENERATED_PACKET_LIST_SELECT)
      .order("create_date", { ascending: false });

    if (showDeleted) {
      query = query.in("status", ["ACTIVE", "DELETED"]);
    } else {
      query = query.eq("status", "ACTIVE");
    }

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [`label.ilike.${term}`, `notes.ilike.${term}`].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setPackets([]);
    } else {
      setPackets((data as PacketListItem[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery, showDeleted]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPackets();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadPackets]);

  useEffect(() => {
    if (!isCreateFlow) {
      void loadPackets();
    }
  }, [isCreateFlow, loadPackets]);

  const openDeleteDialog = (packet: PacketListItem) => {
    setPacketPendingDelete(packet);
    setDeleteDialogOpen(true);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
    setPacketPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!packetPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);

    const supabase = createClient();

    try {
      await deletePacket(supabase, packetPendingDelete.id);
    } catch (deleteError) {
      setListError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete generated packet.",
      );
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setPacketPendingDelete(null);
    await loadPackets();
  };

  const handleRestore = async (packetId: number) => {
    setIsRestoring(true);
    setRestoringPacketId(packetId);
    setListError(null);

    const supabase = createClient();

    try {
      await restorePacket(supabase, packetId);
      await loadPackets();
    } catch (restoreError) {
      setListError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to restore generated packet.",
      );
    } finally {
      setIsRestoring(false);
      setRestoringPacketId(null);
    }
  };

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
          <h1 className="text-2xl font-semibold tracking-tight">Packets</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage buyer rep, listing, and contract offer packets.
          </p>
        </div>
        {!isCreateFlow && (
          <Button onClick={openCreateFlow}>Create packet</Button>
        )}
      </div>

      {isCreateFlow && (
        <Card>
          <CardContent className="pt-6">
            <CreatePacketWizard
              initialWorkflowType={initialWorkflowType}
              onCancel={closeCreateFlow}
              onSelectWorkflowType={selectCreateWorkflow}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{showDeleted ? "All packets" : "Active packets"}</CardTitle>
          <CardDescription>
            Search by packet label. Open a packet to view or edit it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search packets..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="show_deleted_generated_packets"
              checked={showDeleted}
              onCheckedChange={(checked) => setShowDeleted(checked === true)}
            />
            <Label
              htmlFor="show_deleted_generated_packets"
              className="font-normal"
            >
              Show deleted
            </Label>
          </div>

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading packets...</p>
          ) : packets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {showDeleted ? "No packets found." : "No active packets found."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1040px]">
                <div
                  className={`${LIST_COLUMNS} border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground`}
                >
                  <span>ID</span>
                  <span>Packet label</span>
                  <span>Collection</span>
                  <span>Legacy agreement</span>
                  <span>Created</span>
                  <span>Documents</span>
                </div>
                <div className="divide-y">
                  {packets.map((packet) => {
                    const deleted = isPacketDeleted(packet);

                    return (
                      <div
                        key={packet.id}
                        className={cn(
                          "flex flex-col gap-3 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4",
                          deleted && "bg-muted/30 opacity-70",
                        )}
                      >
                        <div
                          className={`${LIST_COLUMNS} items-center px-0 text-sm`}
                        >
                          <span className="text-muted-foreground">
                            {formatPacketReference(packet.id)}
                          </span>
                          <span className="flex items-center gap-2 font-medium">
                            {packet.label}
                            {deleted && (
                              <Badge variant="destructive">Deleted</Badge>
                            )}
                          </span>
                          <span>
                            {packet.collections?.collection_name ?? "—"}
                          </span>
                          <span>
                            {formatRelatedAgreementLabel(
                              packet.representation_agreements,
                            )}
                          </span>
                          <span>{formatDateTime(packet.create_date)}</span>
                          <span>{getActivePacketFormCount(packet)}</span>
                        </div>
                        <ListRowActions>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/packets/${packet.id}`}>View</Link>
                          </Button>
                          {!deleted && (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/packets/${packet.id}/edit`}>
                                Edit
                              </Link>
                            </Button>
                          )}
                          {deleted ? (
                            <Button
                              size="sm"
                              onClick={() => void handleRestore(packet.id)}
                              disabled={
                                isRestoring && restoringPacketId === packet.id
                              }
                            >
                              {isRestoring && restoringPacketId === packet.id
                                ? "Restoring..."
                                : "Restore"}
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteDialog(packet)}
                            >
                              Delete
                            </Button>
                          )}
                        </ListRowActions>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PacketsPageFallback() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">Loading packets...</p>
    </div>
  );
}

export function PacketsPage() {
  return (
    <Suspense fallback={<PacketsPageFallback />}>
      <PacketsPageContent />
    </Suspense>
  );
}
