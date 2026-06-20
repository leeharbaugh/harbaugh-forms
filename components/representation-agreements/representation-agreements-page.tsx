"use client";

import { BuyerRepAgreementForm } from "@/components/representation-agreements/buyer-rep-agreement-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  type BuyerRepAgreementListItem,
  buyerRepAgreementToInput,
  buildContactLinkRows,
  emptyBuyerRepAgreementInput,
  formatAgreementReference,
  formatAgreementStatus,
  formatDate,
  formatRepresentationKind,
  getBuyerRepDetails,
  getOrderedContactNames,
  normalizeBuyerRepAgreementInput,
  validateBuyerRepAgreementInput,
} from "@/lib/types/buyer-rep-agreement";

import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit" | "view";

const AGREEMENT_SELECT = `
  *,
  buyer_rep_details(*),
  representation_agreement_clients(
    id,
    contact_id,
    client_role,
    sort_order,
    status,
    contacts(*)
  )
`;

export function RepresentationAgreementsPage() {
  const [agreements, setAgreements] = useState<BuyerRepAgreementListItem[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingAgreementId, setEditingAgreementId] = useState<number | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyBuyerRepAgreementInput());

  const loadAgreements = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    const { data, error } = await supabase
      .from("representation_agreements")
      .select(AGREEMENT_SELECT)
      .eq("status", "ACTIVE")
      .eq("agreement_type", "BUYER_REP")
      .order("effective_date", { ascending: false });

    if (error) {
      setListError(error.message);
      setAgreements([]);
    } else {
      setAgreements((data as BuyerRepAgreementListItem[]) ?? []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadAgreements();
  }, [loadAgreements]);

  const closeForm = () => {
    setFormMode("hidden");
    setEditingAgreementId(null);
    setFormValue(emptyBuyerRepAgreementInput());
    setFormError(null);
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingAgreementId(null);
    setFormValue(emptyBuyerRepAgreementInput());
    setFormError(null);
  };

  const openAgreementForm = async (
    agreementId: number,
    mode: "edit" | "view",
  ) => {
    setFormError(null);
    setListError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("representation_agreements")
      .select(AGREEMENT_SELECT)
      .eq("id", agreementId)
      .eq("status", "ACTIVE")
      .single();

    if (error || !data) {
      setListError(error?.message ?? "Agreement not found.");
      return;
    }

    const agreement = data as BuyerRepAgreementListItem;
    const details = getBuyerRepDetails(agreement);

    if (!details) {
      setListError("Buyer rep details not found for this agreement.");
      return;
    }

    setFormMode(mode);
    setEditingAgreementId(agreement.id);
    setFormValue(
      buyerRepAgreementToInput(
        agreement,
        details,
        agreement.representation_agreement_clients ?? [],
      ),
    );
  };

  const syncContactLinks = async (
    agreementId: number,
    contactIds: number[],
  ) => {
    const supabase = createClient();

    const { data: existingLinks, error: fetchError } = await supabase
      .from("representation_agreement_clients")
      .select("id, contact_id")
      .eq("representation_agreement_id", agreementId)
      .eq("status", "ACTIVE");

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const existing = existingLinks ?? [];
    const selectedSet = new Set(contactIds);

    for (const link of existing) {
      if (!selectedSet.has(link.contact_id)) {
        const { error } = await supabase
          .from("representation_agreement_clients")
          .update({ status: "DELETED" })
          .eq("id", link.id)
          .eq("status", "ACTIVE");

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    for (let index = 0; index < contactIds.length; index += 1) {
      const contactId = contactIds[index];
      const existingLink = existing.find((link) => link.contact_id === contactId);

      if (existingLink) {
        const { error } = await supabase
          .from("representation_agreement_clients")
          .update({
            sort_order: index,
            client_role: index === 0 ? "PRIMARY" : "CO_CLIENT",
          })
          .eq("id", existingLink.id)
          .eq("status", "ACTIVE");

        if (error) {
          throw new Error(error.message);
        }
      } else {
        const { error } = await supabase
          .from("representation_agreement_clients")
          .insert({
            representation_agreement_id: agreementId,
            contact_id: contactId,
            sort_order: index,
            client_role: index === 0 ? "PRIMARY" : "CO_CLIENT",
          });

        if (error) {
          throw new Error(error.message);
        }
      }
    }
  };

  const handleSave = async () => {
    const validationError = validateBuyerRepAgreementInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeBuyerRepAgreementInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      if (formMode === "create") {
        const { data: createdAgreement, error: agreementError } = await supabase
          .from("representation_agreements")
          .insert(normalized.agreement)
          .select("id")
          .single();

        if (agreementError || !createdAgreement) {
          setFormError(agreementError?.message ?? "Failed to create agreement.");
          setIsSubmitting(false);
          return;
        }

        const agreementId = createdAgreement.id;

        const { error: detailsError } = await supabase
          .from("buyer_rep_details")
          .insert({
            representation_agreement_id: agreementId,
            ...normalized.details,
          });

        if (detailsError) {
          setFormError(detailsError.message);
          setIsSubmitting(false);
          return;
        }

        const { error: clientsError } = await supabase
          .from("representation_agreement_clients")
          .insert(buildContactLinkRows(agreementId, normalized.contact_ids));

        if (clientsError) {
          setFormError(clientsError.message);
          setIsSubmitting(false);
          return;
        }
      }

      if (formMode === "edit" && editingAgreementId !== null) {
        const { error: agreementError } = await supabase
          .from("representation_agreements")
          .update(normalized.agreement)
          .eq("id", editingAgreementId)
          .eq("status", "ACTIVE");

        if (agreementError) {
          setFormError(agreementError.message);
          setIsSubmitting(false);
          return;
        }

        const { error: detailsError } = await supabase
          .from("buyer_rep_details")
          .update(normalized.details)
          .eq("representation_agreement_id", editingAgreementId)
          .eq("status", "ACTIVE");

        if (detailsError) {
          setFormError(detailsError.message);
          setIsSubmitting(false);
          return;
        }

        await syncContactLinks(editingAgreementId, normalized.contact_ids);
      }
    } catch (syncError) {
      setFormError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to save agreement.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeForm();
    await loadAgreements();
  };

  const handleDelete = async (agreement: BuyerRepAgreementListItem) => {
    const clientNames = getOrderedContactNames(agreement);
    const confirmed = window.confirm(
      `Delete buyer rep agreement for ${clientNames} (${formatAgreementReference(agreement.id)})? This will mark the agreement and related records as deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setListError(null);
    const supabase = createClient();

    const { error: clientsError } = await supabase
      .from("representation_agreement_clients")
      .update({ status: "DELETED" })
      .eq("representation_agreement_id", agreement.id)
      .eq("status", "ACTIVE");

    if (clientsError) {
      setListError(clientsError.message);
      return;
    }

    const { error: detailsError } = await supabase
      .from("buyer_rep_details")
      .update({ status: "DELETED" })
      .eq("representation_agreement_id", agreement.id)
      .eq("status", "ACTIVE");

    if (detailsError) {
      setListError(detailsError.message);
      return;
    }

    const { error: agreementError } = await supabase
      .from("representation_agreements")
      .update({ status: "DELETED" })
      .eq("id", agreement.id)
      .eq("status", "ACTIVE");

    if (agreementError) {
      setListError(agreementError.message);
      return;
    }

    if (editingAgreementId === agreement.id) {
      closeForm();
    }

    await loadAgreements();
  };

  const formTitle =
    formMode === "create"
      ? "Create buyer rep agreement"
      : formMode === "edit"
        ? "Edit buyer rep agreement"
        : "View buyer rep agreement";

  const formDescription =
    formMode === "create"
      ? "Create a new buyer representation agreement."
      : formMode === "edit"
        ? "Update agreement, buyers, and buyer rep details."
        : "Read-only view of the buyer representation agreement.";

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Representation Agreements
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage buyer representation agreements for Harbaugh Forms.
          </p>
        </div>
        {formMode === "hidden" && (
          <Button onClick={openCreateForm}>Create agreement</Button>
        )}
      </div>

      {formMode !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <BuyerRepAgreementForm
              value={formValue}
              onChange={setFormValue}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={formMode === "view" ? "view" : formMode}
              agreementId={editingAgreementId}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buyer rep agreements</CardTitle>
          <CardDescription>
            Active buyer representation agreements and linked clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listError && (
            <p className="text-sm text-destructive">{listError}</p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading agreements...</p>
          ) : agreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active buyer rep agreements found.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {agreements.map((agreement) => {
                const details = getBuyerRepDetails(agreement);

                return (
                <div
                  key={agreement.id}
                  className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {getOrderedContactNames(agreement)}
                      </p>
                      {details && (
                        <Badge variant="secondary">
                          {formatRepresentationKind(details.representation_kind)}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {formatAgreementStatus(agreement.agreement_status)}
                      </Badge>
                    </div>
                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <p>
                        Effective: {formatDate(agreement.effective_date)}
                      </p>
                      <p>
                        Expiration: {formatDate(agreement.expiration_date)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatAgreementReference(agreement.id)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openAgreementForm(agreement.id, "view")}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openAgreementForm(agreement.id, "edit")}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDelete(agreement)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
