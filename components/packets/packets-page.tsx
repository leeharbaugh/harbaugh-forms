"use client";

import { CreatePacketWizard } from "@/components/packets/create-packet-wizard";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
import {
  ListRowActions,
} from "@/components/list-row-actions";
import {
  ResizableDataTable,
  ResizableDataTableActionsCell,
  ResizableDataTableCell,
  ResizableDataTableRow,
  type ResizableDataTableColumn,
} from "@/components/resizable-data-table";
import { RecordStatusBadge } from "@/components/ui/list-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const PACKET_TABLE_COLUMNS: ResizableDataTableColumn[] = [
  { id: "id", label: "ID", defaultWidth: 72, minWidth: 48 },
  { id: "label", label: "Packet label", defaultWidth: 220 },
  { id: "collection", label: "Collection", defaultWidth: 160 },
  { id: "agreement", label: "Legacy agreement", defaultWidth: 200 },
  { id: "created", label: "Created", defaultWidth: 148 },
  { id: "documents", label: "Documents", defaultWidth: 96, minWidth: 72 },
  {
    id: "actions",
    label: "Actions",
    defaultWidth: 224,
    isActions: true,
  },
];

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
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        objectType="generated packet"
        itemName={
          packetPendingDelete
            ? `${packetPendingDelete.label} (${formatPacketReference(packetPendingDelete.id)})`
            : null
        }
        consequence="It will be hidden from normal use along with its generated documents and can be restored later."
        canRestore
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
      />

      <ListPageHeader
        title="Packets"
        description="Create and manage buyer rep, listing, and contract offer packets."
        action={
          !isCreateFlow ? (
            <Button onClick={openCreateFlow}>Create packet</Button>
          ) : undefined
        }
      />

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
            <AppCheckbox
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
            <p className="text-sm text-muted-foreground">Loading packets…</p>
          ) : packets.length === 0 ? (
            <ListEmptyState
              title={
                showDeleted ? "No packets found" : "No packets yet"
              }
              description={
                showDeleted
                  ? "Try clearing search or hide deleted packets."
                  : "Create a packet to generate forms for a transaction."
              }
              action={
                !isCreateFlow && !showDeleted ? (
                  <Button size="sm" onClick={openCreateFlow}>
                    Create packet
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ResizableDataTable
              storageKey="harbaugh-packets-list-column-widths"
              tablePreferencesKey="packets_list"
              columns={PACKET_TABLE_COLUMNS}
            >
              {packets.map((packet) => {
                const deleted = isPacketDeleted(packet);
                const collectionName =
                  packet.collections?.collection_name ?? "—";
                const agreementLabel = formatRelatedAgreementLabel(
                  packet.representation_agreements,
                );

                return (
                  <ResizableDataTableRow
                    key={packet.id}
                    className={deleted ? "bg-muted/30" : undefined}
                  >
                    <ResizableDataTableCell className="text-muted-foreground">
                      {formatPacketReference(packet.id)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="truncate font-medium"
                          title={packet.label}
                        >
                          {packet.label}
                        </span>
                        {deleted ? (
                          <RecordStatusBadge status="DELETED" />
                        ) : null}
                      </div>
                    </ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={
                        collectionName === "—" ? undefined : collectionName
                      }
                    >
                      {collectionName}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={
                        agreementLabel === "—" ? undefined : agreementLabel
                      }
                    >
                      {agreementLabel}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate>
                      {formatDateTime(packet.create_date)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>
                      {getActivePacketFormCount(packet)}
                    </ResizableDataTableCell>
                    <ResizableDataTableActionsCell>
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
                    </ResizableDataTableActionsCell>
                  </ResizableDataTableRow>
                );
              })}
            </ResizableDataTable>
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
