import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeDraftRenderInputs,
  computeDraftContentFingerprint,
  draftSnapshotFieldToFieldView,
  parseDraftSnapshotAnnotations,
  parseDraftSnapshotFields,
  toDraftSnapshotField,
  type DraftSnapshotAnnotation,
  type DraftSnapshotField,
} from "./draft-source-fingerprint";

const SOURCE_SHA = "a".repeat(64);

function makeField(
  overrides: Partial<DraftSnapshotField> = {},
): DraftSnapshotField {
  return {
    id: "mapping-1",
    displayValue: "123 Main St",
    field_type: "TEXT",
    placement: {
      page_number: 1,
      x: 72,
      y: 700,
      width: 180,
      height: 18,
      page_width: 612,
      page_height: 792,
      font_size: 10,
      alignment: "left",
    },
    mapping: {
      is_multiline: false,
      mask_background: false,
      pdf_field_name: "Address",
      pdf_export_value: null,
      field_widget_type: "text",
      mapping_name: "Property address",
    },
    instance: {
      id: "instance-1",
      value: "123 Main St",
      field: {
        field_key: "property_address",
        field_label: "Property Address",
        field_data_type: "text",
        field_widget_type: "text",
        default_checked: null,
      },
    },
    ...overrides,
  };
}

function makeAnnotation(
  overrides: Partial<DraftSnapshotAnnotation> = {},
): DraftSnapshotAnnotation {
  return {
    id: "annotation-1",
    annotation_type: "typed_signature",
    page_number: 2,
    text_value: "Dana Doe",
    font_id: "caveat",
    x: 100,
    y: 200,
    width: 140,
    height: 36,
    rotation: 0,
    ...overrides,
  };
}

describe("draft source render-input canonicalization", () => {
  it("is stable for identical inputs", () => {
    const inputs = {
      sourcePdfSha256: SOURCE_SHA,
      fieldViews: [makeField()],
      annotations: [makeAnnotation()],
    };
    assert.equal(
      canonicalizeDraftRenderInputs(inputs),
      canonicalizeDraftRenderInputs(inputs),
    );
    assert.match(computeDraftContentFingerprint(inputs), /^[0-9a-f]{64}$/);
  });

  it("does not depend on field or annotation collection order", () => {
    const fieldA = makeField({ id: "mapping-a" });
    const fieldB = makeField({ id: "mapping-b", displayValue: "Second" });
    const annotationA = makeAnnotation({ id: "annotation-a" });
    const annotationB = makeAnnotation({
      id: "annotation-b",
      text_value: "Rae Roe",
    });

    const forward = computeDraftContentFingerprint({
      sourcePdfSha256: SOURCE_SHA,
      fieldViews: [fieldA, fieldB],
      annotations: [annotationA, annotationB],
    });
    const reversed = computeDraftContentFingerprint({
      sourcePdfSha256: SOURCE_SHA,
      fieldViews: [fieldB, fieldA],
      annotations: [annotationB, annotationA],
    });

    assert.equal(forward, reversed);
  });

  it("changes when any render-affecting value changes", () => {
    const base = {
      sourcePdfSha256: SOURCE_SHA,
      fieldViews: [makeField()],
      annotations: [makeAnnotation()],
    };
    const baseline = computeDraftContentFingerprint(base);

    const variants: Array<[string, DraftSnapshotField]> = [
      ["value", makeField({ displayValue: "456 Oak Ave" })],
      [
        "geometry",
        makeField({
          placement: { ...makeField().placement, x: 73 },
        }),
      ],
      [
        "multiline",
        makeField({ mapping: { ...makeField().mapping, is_multiline: true } }),
      ],
      [
        "mask background",
        makeField({
          mapping: { ...makeField().mapping, mask_background: true },
        }),
      ],
      [
        "pdf field name",
        makeField({
          mapping: { ...makeField().mapping, pdf_field_name: "Address2" },
        }),
      ],
      [
        "pdf export value",
        makeField({
          mapping: { ...makeField().mapping, pdf_export_value: "Yes" },
        }),
      ],
      [
        "checkbox default",
        makeField({
          field_type: "CHECKBOX",
          instance: {
            ...makeField().instance,
            field: { ...makeField().instance.field, default_checked: true },
          },
        }),
      ],
    ];

    for (const [label, field] of variants) {
      assert.notEqual(
        computeDraftContentFingerprint({ ...base, fieldViews: [field] }),
        baseline,
        `${label} should change the fingerprint`,
      );
    }

    assert.notEqual(
      computeDraftContentFingerprint({
        ...base,
        sourcePdfSha256: "b".repeat(64),
      }),
      baseline,
      "different source PDF bytes should change the fingerprint",
    );

    assert.notEqual(
      computeDraftContentFingerprint({
        ...base,
        annotations: [makeAnnotation({ text_value: "Someone Else" })],
      }),
      baseline,
      "annotation text should change the fingerprint",
    );
    assert.notEqual(
      computeDraftContentFingerprint({
        ...base,
        annotations: [makeAnnotation({ y: 201 })],
      }),
      baseline,
      "annotation geometry should change the fingerprint",
    );
  });

  it("ignores values the fill pipeline never reads", () => {
    const baseline = computeDraftContentFingerprint({
      sourcePdfSha256: SOURCE_SHA,
      fieldViews: [makeField()],
      annotations: [makeAnnotation()],
    });

    // Field-instance identity is stored for traceability but does not affect
    // rendered output, so it must not look like source drift.
    assert.equal(
      computeDraftContentFingerprint({
        sourcePdfSha256: SOURCE_SHA,
        fieldViews: [
          makeField({
            instance: { ...makeField().instance, id: "instance-renumbered" },
          }),
        ],
        annotations: [makeAnnotation()],
      }),
      baseline,
    );

    assert.equal(
      computeDraftContentFingerprint({
        sourcePdfSha256: SOURCE_SHA,
        fieldViews: [makeField()],
        annotations: [makeAnnotation({ rotation: 0, font_id: "caveat" })],
      }),
      baseline,
    );
  });

  it("normalizes negative zero so equivalent placements match", () => {
    const positive = makeField({
      placement: { ...makeField().placement, x: 0 },
    });
    const negative = makeField({
      placement: { ...makeField().placement, x: -0 },
    });
    assert.equal(
      computeDraftContentFingerprint({
        sourcePdfSha256: SOURCE_SHA,
        fieldViews: [positive],
        annotations: [],
      }),
      computeDraftContentFingerprint({
        sourcePdfSha256: SOURCE_SHA,
        fieldViews: [negative],
        annotations: [],
      }),
    );
  });
});

describe("draft source snapshot payload round trip", () => {
  it("reconstructs every fingerprinted input from the stored payload", () => {
    const field = makeField();
    const rebuilt = toDraftSnapshotField(draftSnapshotFieldToFieldView(field));
    assert.deepEqual(rebuilt, field);
  });

  it("re-reads persisted JSON payloads without losing render inputs", () => {
    const field = makeField();
    const annotation = makeAnnotation();
    const persisted = JSON.parse(
      JSON.stringify({ fields: [field], annotations: [annotation] }),
    ) as { fields: unknown; annotations: unknown };

    assert.deepEqual(parseDraftSnapshotFields(persisted.fields), [field]);
    assert.deepEqual(parseDraftSnapshotAnnotations(persisted.annotations), [
      annotation,
    ]);
  });

  it("drops annotation types the fill pipeline does not draw", () => {
    assert.deepEqual(
      parseDraftSnapshotAnnotations([
        { ...makeAnnotation(), annotation_type: "sticky_note" },
      ]),
      [],
    );
  });
});
