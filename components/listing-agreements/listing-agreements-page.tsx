"use client";

import { ListingAgreementForm } from "@/components/listing-agreements/listing-agreement-form";
import { usePropertyDuplicateConfirm } from "@/components/properties/use-property-duplicate-confirm";
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
import { createClient } from "@/lib/supabase/client";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { saveNewPropertyWithDuplicateHandling } from "@/lib/property-duplicate";
import {
  type ListingAgreementListItem,
  buildListingContactLinkRows,
  emptyListingAgreementInput,
  formatAgreementReference,
  formatAgreementStatus,
  formatCurrency,
  formatDate,
  formatListingRepresentationKind,
  getSellerClientRole,
  getLinkedProperty,
  getListingAgreementDetails,
  getOrderedSellerNames,
  getPropertyAddressForListItem,
  listingAgreementToInput,
  normalizeListingAgreementInput,
  validateListingAgreementInput,
} from "@/lib/types/listing-agreement";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit" | "view";

const AGREEMENT_SELECT = `
  *,
  listing_agreement_details(*),
  properties(*),
  representation_agreement_clients(
    id,
    contact_id,
    client_role,
    sort_order,
    status,
    contacts(*)
  )
`;

export function ListingAgreementsPage() {
  const [agreements, setAgreements] = useState<ListingAgreementListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingAgreementId, setEditingAgreementId] = useState<number | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyListingAgreementInput());
  const { promptDuplicate, dialog: duplicateDialog } =
    usePropertyDuplicateConfirm();
  const [agreementPendingDelete, setAgreementPendingDelete] =
    useState<ListingAgreementListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAgreements = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    const { data, error } = await supabase
      .from("representation_agreements")
      .select(AGREEMENT_SELECT)
      .eq("status", "ACTIVE")
      .eq("agreement_type", "LISTING")
      .order("effective_date", { ascending: false });

    if (error) {
      setListError(error.message);
      setAgreements([]);
    } else {
      setAgreements((data as ListingAgreementListItem[]) ?? []);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadAgreements();
  }, [loadAgreements]);

  const closeForm = () => {
    setFormMode("hidden");
    setEditingAgreementId(null);
    setFormValue(emptyListingAgreementInput());
    setFormError(null);
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingAgreementId(null);
    setFormValue(emptyListingAgreementInput());
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

    const agreement = data as ListingAgreementListItem;
    const details = getListingAgreementDetails(agreement);

    if (!details) {
      setListError("Listing agreement details not found for this agreement.");
      return;
    }

    setFormMode(mode);
    setEditingAgreementId(agreement.id);
    setFormValue(
      listingAgreementToInput(
        agreement,
        details,
        agreement.representation_agreement_clients ?? [],
        getLinkedProperty(agreement),
      ),
    );
  };

  const syncClientLinks = async (
    agreementId: number,
    clientIds: number[],
    representationKind: "SALE" | "LEASE",
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
    const selectedSet = new Set(clientIds);

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

    for (let index = 0; index < clientIds.length; index += 1) {
      const clientId = clientIds[index];
      const existingLink = existing.find((link) => link.contact_id === clientId);
      const clientRole = getSellerClientRole(representationKind, index);

      if (existingLink) {
        const { error } = await supabase
          .from("representation_agreement_clients")
          .update({
            sort_order: index,
            client_role: clientRole,
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
            contact_id: clientId,
            sort_order: index,
            client_role: clientRole,
          });

        if (error) {
          throw new Error(error.message);
        }
      }
    }
  };

  const resolvePropertyId = async (
    normalized: ReturnType<typeof normalizeListingAgreementInput>,
  ) => {
    const supabase = createClient();

    if (normalized.property_mode === "new") {
      const propertyId = await saveNewPropertyWithDuplicateHandling(
        supabase,
        normalized.property,
        promptDuplicate,
      );

      if (propertyId === null) {
        return null;
      }

      return propertyId;
    }

    if (normalized.property_id == null) {
      throw new Error("Property is required.");
    }

    return normalized.property_id;
  };

  const handleSave = async () => {
    const validationError = validateListingAgreementInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizeListingAgreementInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      const propertyId = await resolvePropertyId(normalized);

      if (propertyId === null) {
        setIsSubmitting(false);
        return;
      }

      if (formMode === "create") {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: createdAgreement, error: agreementError } = await supabase
          .from("representation_agreements")
          .insert({
            ...normalized.agreement,
            property_id: propertyId,
            owner_user_id: user?.id ?? null,
            created_by_user_id: user?.id ?? null,
          })
          .select("id")
          .single();

        if (agreementError || !createdAgreement) {
          setFormError(agreementError?.message ?? "Failed to create agreement.");
          setIsSubmitting(false);
          return;
        }

        const agreementId = createdAgreement.id;

        const { error: detailsError } = await supabase
          .from("listing_agreement_details")
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
          .insert(
            buildListingContactLinkRows(
              agreementId,
              normalized.contact_ids,
              normalized.details.representation_kind,
            ),
          );

        if (clientsError) {
          setFormError(clientsError.message);
          setIsSubmitting(false);
          return;
        }
      }

      if (formMode === "edit" && editingAgreementId !== null) {
        const { error: agreementError } = await supabase
          .from("representation_agreements")
          .update({
            ...normalized.agreement,
            property_id: propertyId,
          })
          .eq("id", editingAgreementId)
          .eq("status", "ACTIVE");

        if (agreementError) {
          setFormError(agreementError.message);
          setIsSubmitting(false);
          return;
        }

        const { error: detailsError } = await supabase
          .from("listing_agreement_details")
          .update(normalized.details)
          .eq("representation_agreement_id", editingAgreementId)
          .eq("status", "ACTIVE");

        if (detailsError) {
          setFormError(detailsError.message);
          setIsSubmitting(false);
          return;
        }

        await syncClientLinks(
          editingAgreementId,
          normalized.contact_ids,
          normalized.details.representation_kind,
        );
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save agreement.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeForm();
    await loadAgreements();
  };

  const openDeleteDialog = (agreement: ListingAgreementListItem) => {
    setAgreementPendingDelete(agreement);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setAgreementPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!agreementPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);
    const supabase = createClient();

    const { error: clientsError } = await supabase
      .from("representation_agreement_clients")
      .update({ status: "DELETED" })
      .eq("representation_agreement_id", agreementPendingDelete.id)
      .eq("status", "ACTIVE");

    if (clientsError) {
      setIsDeleting(false);
      setListError(clientsError.message);
      return;
    }

    const { error: detailsError } = await supabase
      .from("listing_agreement_details")
      .update({ status: "DELETED" })
      .eq("representation_agreement_id", agreementPendingDelete.id)
      .eq("status", "ACTIVE");

    if (detailsError) {
      setIsDeleting(false);
      setListError(detailsError.message);
      return;
    }

    const { error: agreementError } = await supabase
      .from("representation_agreements")
      .update({ status: "DELETED" })
      .eq("id", agreementPendingDelete.id)
      .eq("status", "ACTIVE");

    setIsDeleting(false);

    if (agreementError) {
      setListError(agreementError.message);
      return;
    }

    if (editingAgreementId === agreementPendingDelete.id) {
      closeForm();
    }

    setAgreementPendingDelete(null);
    await loadAgreements();
  };

  const formTitle =
    formMode === "create"
      ? "Create listing agreement"
      : formMode === "edit"
        ? "Edit listing agreement"
        : "View listing agreement";

  const formDescription =
    formMode === "create"
      ? "Create a new listing representation agreement."
      : formMode === "edit"
        ? "Update agreement, sellers, property, and listing details."
        : "Read-only view of the listing representation agreement.";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {duplicateDialog}
      <ConfirmDeleteDialog
        open={agreementPendingDelete != null}
        objectType="listing agreement"
        itemName={
          agreementPendingDelete
            ? `${getPropertyAddressForListItem(agreementPendingDelete)} (${formatAgreementReference(agreementPendingDelete.id)})`
            : null
        }
        consequence="This marks the agreement and related records as deleted and hides them from normal use."
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
      />
      <ListPageHeader
        title="Listing Agreements"
        description="Manage listing representation agreements for Harbaugh Forms."
        action={
          formMode === "hidden" ? (
            <Button onClick={openCreateForm}>Create agreement</Button>
          ) : undefined
        }
      />

      {formMode !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ListingAgreementForm
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
          <CardTitle>Active listing agreements</CardTitle>
          <CardDescription>
            Listing agreements with property, sellers, and pricing details.
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
              No active listing agreements found.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {agreements.map((agreement) => {
                const details = getListingAgreementDetails(agreement);

                return (
                  <div
                    key={agreement.id}
                    className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {getPropertyAddressForListItem(agreement)}
                        </p>
                        {details && (
                          <Badge variant="secondary">
                            {formatListingRepresentationKind(
                              details.representation_kind,
                            )}
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {formatAgreementStatus(agreement.agreement_status)}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Sellers: </span>
                        {getOrderedSellerNames(agreement)}
                      </p>
                      <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                        <p>
                          List price:{" "}
                          {formatCurrency(details?.list_price ?? null)}
                        </p>
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
                        onClick={() => openDeleteDialog(agreement)}
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
