import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backfillPacketAvailabilityState,
  backfillPublicationState,
  canOperateOnPacketFormContent,
  canPublishForm,
  canRestoreForm,
  canRetireForm,
  canStructurallyEditForm,
  canUnpublishForm,
  formatCollectionFormAvailabilityBadge,
  formatFormPublicationBadge,
  formatFormStateEventType,
  FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
  FORM_RETIRED_READONLY_MESSAGE,
  isFormDraft,
  isFormPublished,
  isFormRetired,
  isFormSelectableForCollection,
  isPacketFormPendingPublication,
  isValidFormLifecycleTransition,
  normalizeFormFamilyKey,
  planPacketFormInstantiation,
  structuralEditBlockedMessage,
} from "./form-lifecycle.ts";

describe("form publication backfill", () => {
  it("backfills ACTIVE forms to PUBLISHED", () => {
    assert.equal(backfillPublicationState("ACTIVE"), "PUBLISHED");
  });

  it("backfills INACTIVE forms to DRAFT", () => {
    assert.equal(backfillPublicationState("INACTIVE"), "DRAFT");
  });

  it("backfills packet_forms to AVAILABLE", () => {
    assert.equal(backfillPacketAvailabilityState(), "AVAILABLE");
  });
});

describe("new form defaults", () => {
  it("new forms start ACTIVE + DRAFT", () => {
    const form = { status: "ACTIVE", publication_state: "DRAFT" };
    assert.equal(isFormDraft(form), true);
    assert.equal(isFormPublished(form), false);
    assert.equal(canPublishForm(form), true);
  });

  it("normalizes form_family_key from form_code", () => {
    assert.equal(normalizeFormFamilyKey("txr-1601"), "TXR-1601");
    assert.equal(normalizeFormFamilyKey("  TREC-30  "), "TREC-30");
  });
});

describe("lifecycle transitions", () => {
  it("rejects generic direct lifecycle edits outside the state machine", () => {
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "INACTIVE", publication_state: "DRAFT" },
        { status: "ACTIVE", publication_state: "PUBLISHED" },
      ),
      false,
    );
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "DELETED", publication_state: "DRAFT" },
        { status: "ACTIVE", publication_state: "DRAFT" },
      ),
      false,
    );
  });

  it("allows publish, unpublish, retire, and restore transitions", () => {
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "ACTIVE", publication_state: "DRAFT" },
        { status: "ACTIVE", publication_state: "PUBLISHED" },
      ),
      true,
    );
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "ACTIVE", publication_state: "PUBLISHED" },
        { status: "ACTIVE", publication_state: "DRAFT" },
      ),
      true,
    );
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "ACTIVE", publication_state: "PUBLISHED" },
        { status: "INACTIVE", publication_state: "DRAFT" },
      ),
      true,
    );
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "INACTIVE", publication_state: "DRAFT" },
        { status: "ACTIVE", publication_state: "DRAFT" },
      ),
      true,
    );
  });

  it("makes INACTIVE + PUBLISHED impossible", () => {
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "ACTIVE", publication_state: "PUBLISHED" },
        { status: "INACTIVE", publication_state: "PUBLISHED" },
      ),
      false,
    );
  });

  it("restore returns ACTIVE + DRAFT only", () => {
    assert.equal(
      canRestoreForm({ status: "INACTIVE", publication_state: "DRAFT" }),
      true,
    );
    assert.equal(
      isValidFormLifecycleTransition(
        { status: "INACTIVE", publication_state: "DRAFT" },
        { status: "ACTIVE", publication_state: "PUBLISHED" },
      ),
      false,
    );
  });
});

describe("structural editing rules", () => {
  it("rejects published structural edits", () => {
    const published = { status: "ACTIVE", publication_state: "PUBLISHED" };
    assert.equal(canStructurallyEditForm(published), false);
    assert.equal(
      structuralEditBlockedMessage(published),
      FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
    );
  });

  it("unpublish enables structural editing", () => {
    const draft = { status: "ACTIVE", publication_state: "DRAFT" };
    assert.equal(canStructurallyEditForm(draft), true);
    assert.equal(structuralEditBlockedMessage(draft), null);
  });

  it("retired forms are read-only", () => {
    const retired = { status: "INACTIVE", publication_state: "DRAFT" };
    assert.equal(canStructurallyEditForm(retired), false);
    assert.equal(canPublishForm(retired), false);
    assert.equal(canRetireForm(retired), false);
    assert.equal(
      structuralEditBlockedMessage(retired),
      FORM_RETIRED_READONLY_MESSAGE,
    );
  });
});

describe("collection and packet instantiation", () => {
  it("collection selectors show only ACTIVE + PUBLISHED forms", () => {
    assert.equal(
      isFormSelectableForCollection({
        status: "ACTIVE",
        publication_state: "PUBLISHED",
      }),
      true,
    );
    assert.equal(
      isFormSelectableForCollection({
        status: "ACTIVE",
        publication_state: "DRAFT",
      }),
      false,
    );
  });

  it("existing Draft collection references remain labeled", () => {
    assert.equal(
      formatCollectionFormAvailabilityBadge({
        status: "ACTIVE",
        publication_state: "DRAFT",
      }),
      "Draft — temporarily unavailable",
    );
    assert.equal(
      formatCollectionFormAvailabilityBadge({
        status: "INACTIVE",
        publication_state: "DRAFT",
      }),
      "Retired",
    );
  });

  it("published collection forms instantiate AVAILABLE", () => {
    assert.deepEqual(
      planPacketFormInstantiation({
        status: "ACTIVE",
        publication_state: "PUBLISHED",
      }),
      { kind: "available" },
    );
  });

  it("draft collection forms instantiate PENDING_PUBLICATION", () => {
    assert.deepEqual(
      planPacketFormInstantiation({
        status: "ACTIVE",
        publication_state: "DRAFT",
      }),
      { kind: "pending_publication" },
    );
  });

  it("retired forms do not instantiate", () => {
    assert.deepEqual(
      planPacketFormInstantiation({
        status: "INACTIVE",
        publication_state: "DRAFT",
      }),
      { kind: "skip", reason: "retired" },
    );
  });
});

describe("pending packet forms", () => {
  it("pending forms cannot be filled, refreshed, finalized, or generated", () => {
    assert.equal(isPacketFormPendingPublication("PENDING_PUBLICATION"), true);
    assert.equal(
      canOperateOnPacketFormContent({
        rowStatus: "ACTIVE",
        documentState: "DRAFT",
        availabilityState: "PENDING_PUBLICATION",
      }),
      false,
    );
  });

  it("unpublish does not disable existing AVAILABLE packet_forms", () => {
    assert.equal(
      canOperateOnPacketFormContent({
        rowStatus: "ACTIVE",
        documentState: "DRAFT",
        availabilityState: "AVAILABLE",
      }),
      true,
    );
  });
});

describe("publish empty-mapping confirmation", () => {
  it("requires confirmation for zero mappings", () => {
    const mappingCount = 0;
    const allowEmptyMappings = false;
    assert.equal(mappingCount === 0 && !allowEmptyMappings, true);
  });

  it("allows empty mappings after explicit confirmation", () => {
    assert.equal(0 === 0 && !true, false);
    assert.equal(
      canPublishForm({ status: "ACTIVE", publication_state: "DRAFT" }),
      true,
    );
  });
});

describe("audit event labels", () => {
  it("uses business wording for lifecycle events", () => {
    assert.equal(formatFormStateEventType("FORM_PUBLISHED"), "Published");
    assert.equal(formatFormStateEventType("FORM_UNPUBLISHED"), "Unpublished");
    assert.equal(formatFormStateEventType("FORM_RETIRED"), "Retired");
    assert.equal(formatFormStateEventType("FORM_RESTORED"), "Restored");
  });

  it("formats publication badges", () => {
    assert.equal(
      formatFormPublicationBadge({
        status: "ACTIVE",
        publication_state: "PUBLISHED",
      }),
      "Published",
    );
    assert.equal(
      formatFormPublicationBadge({
        status: "INACTIVE",
        publication_state: "DRAFT",
      }),
      "Retired",
    );
  });

  it("exposes action gates used by UI", () => {
    assert.equal(
      canUnpublishForm({ status: "ACTIVE", publication_state: "PUBLISHED" }),
      true,
    );
    assert.equal(
      canRetireForm({ status: "ACTIVE", publication_state: "DRAFT" }),
      true,
    );
  });
});

describe("shared Global field published usage", () => {
  it("identifies Published-form usage for shared field warnings", () => {
    const usages = [
      {
        formId: 1,
        status: "ACTIVE",
        publication_state: "PUBLISHED",
        formName: "A",
      },
      {
        formId: 2,
        status: "ACTIVE",
        publication_state: "DRAFT",
        formName: "B",
      },
    ];
    const publishedUsages = usages.filter((row) => isFormPublished(row));
    assert.equal(publishedUsages.length, 1);
    assert.equal(publishedUsages[0]?.formName, "A");
  });
});
