import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clickToPdfCoordinates,
  renderRectToPdfPlacement,
  type PageMetrics,
} from "@/lib/types/template-pdf-field";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Visual Signing field editor", () => {
  it("round-trips page-relative geometry independent of rendered zoom", () => {
    const metrics: PageMetrics = {
      originalWidth: 612,
      originalHeight: 792,
      renderedWidth: 720,
      renderedHeight: (792 / 612) * 720,
    };
    const click = clickToPdfCoordinates(360, 198, metrics);
    assert.ok(Math.abs(click.x - 306) < 0.1);
    assert.ok(Math.abs(click.y - 168.3) < 0.5);

    const pdf = renderRectToPdfPlacement(
      { x: 100, y: 50, width: 160, height: 40 },
      metrics,
    );
    assert.ok(pdf.width > 0);
    assert.ok(pdf.height > 0);

    const zoomed: PageMetrics = {
      ...metrics,
      renderedWidth: 360,
      renderedHeight: (792 / 612) * 360,
    };
    const again = renderRectToPdfPlacement(
      {
        x: (pdf.x / metrics.originalWidth) * zoomed.renderedWidth,
        y: (pdf.y / metrics.originalHeight) * zoomed.renderedHeight,
        width: (pdf.width / metrics.originalWidth) * zoomed.renderedWidth,
        height: (pdf.height / metrics.originalHeight) * zoomed.renderedHeight,
      },
      zoomed,
    );
    assert.ok(Math.abs(again.x - pdf.x) < 0.2);
    assert.ok(Math.abs(again.y - pdf.y) < 0.2);
    assert.ok(Math.abs(again.width - pdf.width) < 0.2);
    assert.ok(Math.abs(again.height - pdf.height) < 0.2);
  });

  it("exposes Prepare Documents workspace with trusted draft-field writes", () => {
    const dialog = read("components/signings/signing-preview-dialog.tsx");
    const prep = read("components/signings/signing-draft-prep-panel.tsx");
    const draftFields = read("lib/signing/draft-fields.ts");
    const preview = read("lib/signing/preview.ts");

    assert.match(dialog, /Prepare Documents/);
    assert.match(dialog, /mode === "prepare"/);
    assert.match(dialog, /upsertDraftSigningFieldAction/);
    assert.match(dialog, /removeDraftSigningFieldAction/);
    assert.match(dialog, /react-rnd/);
    assert.match(dialog, /DATE_SIGNED/);
    assert.match(dialog, /linkedSignatureDraftFieldId/);
    assert.match(dialog, /clickToPdfCoordinates/);
    assert.match(dialog, /renderRectToPdfPlacement/);
    assert.match(dialog, /participantFullName/);
    assert.match(dialog, /representing/);
    assert.match(prep, /Prepare Documents/);
    assert.match(prep, /Open \/ Prepare/);
    assert.match(prep, /Optional quick fields/);
    assert.match(draftFields, /DATE_SIGNED fields require a linked Signature/);
    assert.match(preview, /linkedSignatureFieldId/);
    assert.match(preview, /participants/);
  });

  it("keeps Preview read-only on the same Draft source model", () => {
    const dialog = read("components/signings/signing-preview-dialog.tsx");
    const preview = read("lib/signing/preview.ts");
    assert.match(dialog, /Preview Signing/);
    assert.match(dialog, /pointer-events-none/);
    assert.match(preview, /renderPreparedPdfFromSelectedDraftSnapshot/);
    assert.doesNotMatch(preview, /promotePackageRevisionFromDraftWithActor/);
  });
});
