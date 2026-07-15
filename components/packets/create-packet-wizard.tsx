"use client";

import { CreatePacketFromAgreementForm } from "@/components/packets/create-packet-form";
import { CreatePacketFromCollectionForm } from "@/components/packets/create-packet-from-collection-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  formatAgreementReference,
  formatDate,
  getOrderedContactNames,
  type BuyerRepAgreementListItem,
} from "@/lib/types/buyer-rep-agreement";
import {
  formatAgreementStatus,
  getOrderedSellerNames,
  getPropertyAddressForListItem,
  type ListingAgreementListItem,
} from "@/lib/types/listing-agreement";
import {
  formatPacketWorkflowType,
  getPacketWorkflowDescription,
  PACKET_WORKFLOW_TYPES,
  type PacketWorkflowType,
  workflowSupportsLegacyAgreement,
  workflowToAgreementType,
} from "@/lib/types/packet-workflow";
import { useCallback, useEffect, useState } from "react";

type AgreementOption = {
  id: number;
  agreement_status: string;
  label: string;
  subtitle: string;
};

type CreatePacketWizardProps = {
  initialWorkflowType?: PacketWorkflowType | null;
  onCancel: () => void;
  onSelectWorkflowType?: (type: PacketWorkflowType) => void;
};

const BUYER_REP_AGREEMENT_SELECT = `
  id,
  agreement_type,
  effective_date,
  agreement_status,
  representation_agreement_clients(
    sort_order,
    status,
    contacts(*)
  )
`;

const LISTING_AGREEMENT_SELECT = `
  id,
  agreement_type,
  effective_date,
  agreement_status,
  properties(*),
  representation_agreement_clients(
    sort_order,
    status,
    contacts(*)
  )
`;

export function CreatePacketWizard({
  initialWorkflowType = null,
  onCancel,
  onSelectWorkflowType,
}: CreatePacketWizardProps) {
  const [workflowType, setWorkflowType] = useState<PacketWorkflowType | null>(
    initialWorkflowType,
  );
  const [showLegacyAgreementPath, setShowLegacyAgreementPath] = useState(false);
  const [agreements, setAgreements] = useState<AgreementOption[]>([]);
  const [draftAgreementId, setDraftAgreementId] = useState<number | null>(null);
  const [confirmedAgreementId, setConfirmedAgreementId] = useState<
    number | null
  >(null);
  const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const resetLegacyAgreementStep = () => {
    setDraftAgreementId(null);
    setConfirmedAgreementId(null);
    setAgreements([]);
    setLoadError(null);
    setShowLegacyAgreementPath(false);
  };

  useEffect(() => {
    setWorkflowType(initialWorkflowType);
    resetLegacyAgreementStep();
  }, [initialWorkflowType]);

  const loadAgreements = useCallback(async (workflow: PacketWorkflowType) => {
    const agreementType = workflowToAgreementType(workflow);
    if (!agreementType) {
      return;
    }

    setIsLoadingAgreements(true);
    setLoadError(null);

    const supabase = createClient();

    const { data, error } =
      agreementType === "LISTING"
        ? await supabase
            .from("representation_agreements")
            .select(LISTING_AGREEMENT_SELECT)
            .eq("status", "ACTIVE")
            .eq("agreement_type", agreementType)
            .order("effective_date", { ascending: false })
        : await supabase
            .from("representation_agreements")
            .select(BUYER_REP_AGREEMENT_SELECT)
            .eq("status", "ACTIVE")
            .eq("agreement_type", agreementType)
            .order("effective_date", { ascending: false });

    if (error) {
      setLoadError(error.message);
      setAgreements([]);
      setDraftAgreementId(null);
      setIsLoadingAgreements(false);
      return;
    }

    const options: AgreementOption[] = ((data ?? []) as unknown[]).map(
      (row) => {
        if (agreementType === "LISTING") {
          const item = row as ListingAgreementListItem;
          return {
            id: item.id,
            agreement_status: item.agreement_status,
            label: getOrderedSellerNames(item),
            subtitle: `${formatAgreementReference(item.id)} · ${getPropertyAddressForListItem(item)} · Effective ${formatDate(item.effective_date)}`,
          };
        }

        const item = row as BuyerRepAgreementListItem;
        return {
          id: item.id,
          agreement_status: item.agreement_status,
          label: getOrderedContactNames(item),
          subtitle: `${formatAgreementReference(item.id)} · Effective ${formatDate(item.effective_date)}`,
        };
      },
    );

    setAgreements(options);
    setDraftAgreementId(options[0]?.id ?? null);
    setIsLoadingAgreements(false);
  }, []);

  useEffect(() => {
    if (showLegacyAgreementPath && workflowType) {
      void loadAgreements(workflowType);
    }
  }, [showLegacyAgreementPath, workflowType, loadAgreements]);

  if (!workflowType) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Create packet</h2>
          <p className="text-sm text-muted-foreground">
            Choose the type of packet you want to create.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PACKET_WORKFLOW_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="rounded-md border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (onSelectWorkflowType) {
                  onSelectWorkflowType(type);
                } else {
                  setWorkflowType(type);
                }
              }}
            >
              <p className="font-medium">{formatPacketWorkflowType(type)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getPacketWorkflowDescription(type)}
              </p>
            </button>
          ))}
        </div>

        <FormActions>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </div>
    );
  }

  if (
    showLegacyAgreementPath &&
    workflowSupportsLegacyAgreement(workflowType) &&
    confirmedAgreementId !== null
  ) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              Legacy: {formatPacketWorkflowType(workflowType)} packet
            </h2>
            <p className="text-sm text-muted-foreground">
              Advanced path — packet will be linked to a representation
              agreement.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmedAgreementId(null)}
          >
            Change agreement
          </Button>
        </div>

        <CreatePacketFromAgreementForm
          workflowType={workflowType}
          agreementId={confirmedAgreementId}
          onCancel={() => {
            setConfirmedAgreementId(null);
            setShowLegacyAgreementPath(false);
          }}
        />
      </div>
    );
  }

  if (
    showLegacyAgreementPath &&
    workflowSupportsLegacyAgreement(workflowType)
  ) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              Legacy: {formatPacketWorkflowType(workflowType)} packet
            </h2>
            <p className="text-sm text-muted-foreground">
              Optional advanced path — anchor this packet to an existing
              representation agreement.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              resetLegacyAgreementStep();
            }}
          >
            Back to standard create
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agreement_id">Representation agreement *</Label>
          {isLoadingAgreements ? (
            <p className="text-sm text-muted-foreground">Loading agreements…</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : agreements.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-sm text-muted-foreground">
                  No active {formatPacketWorkflowType(workflowType).toLowerCase()}{" "}
                  agreements found.
                </p>
                <p className="text-xs text-muted-foreground">
                  Legacy URLs (not in navigation): /representation-agreements
                  {workflowType === "listing" ? ", /listing-agreements" : ""}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Select
              id="agreement_id"
              value={draftAgreementId ?? ""}
              onChange={(event) =>
                setDraftAgreementId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              {agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.label} — {agreement.subtitle} (
                  {formatAgreementStatus(
                    agreement.agreement_status as Parameters<
                      typeof formatAgreementStatus
                    >[0],
                  )}
                  )
                </option>
              ))}
            </Select>
          )}
        </div>

        <FormActions>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={draftAgreementId === null || agreements.length === 0}
            onClick={() => {
              if (draftAgreementId !== null) {
                setConfirmedAgreementId(draftAgreementId);
              }
            }}
          >
            Continue with legacy agreement
          </Button>
        </FormActions>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          Back to packets
        </Button>
      </div>

      <CreatePacketFromCollectionForm
        workflowType={workflowType}
        onCancel={onCancel}
      />

      {workflowSupportsLegacyAgreement(workflowType) && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Advanced (legacy)</CardTitle>
            <CardDescription>
              Link this packet to an existing representation agreement instead of
              creating from contacts directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLegacyAgreementPath(true)}
            >
              Use legacy agreement anchor
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
