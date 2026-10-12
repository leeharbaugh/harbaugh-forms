import fontkit from "@pdf-lib/fontkit";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  SIGNING_STATE_POLL_MS,
  shouldWatchSigningState,
  signingOutcomeMessage,
} from "@/components/signings/use-signing-state-watcher";
import { fitTypedSignatureFontSize, typedSignatureFontSize } from "@/lib/pdf-text-layout";
import { appliedMarkLayout } from "@/lib/signing/applied-mark-layout";
import {
  CEREMONY_DOCK_MIN_WIDTH_PX,
  CEREMONY_FIELDS_PANEL_WIDTH_PX,
  CEREMONY_MIN_DOCUMENT_WIDTH_PX,
  ceremonyFieldsPanelMode,
} from "@/lib/signing/ceremony-layout";
import {
  DATE_SIGNED_DEFAULT_SIZE,
  defaultDraftFieldSize,
  fitDateSignedFontSize,
} from "@/lib/signing/draft-field-sizing";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8").replace(/\r\n/g, "\n");

/** The body of `name` up to the next top-level function. */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

async function pdfFonts() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as Parameters<PDFDocument["registerFontkit"]>[0]);
  return {
    caveat: await doc.embedFont(readFileSync(join(root, "public/fonts/Caveat-Regular.ttf"))),
    helvetica: await doc.embedFont(StandardFonts.Helvetica),
  };
}

const DATE = "2026-10-11";
const INITIALS_DEFAULT = defaultDraftFieldSize("INITIALS", { fullName: "Tara Lynn Harbaugh" });

describe("Applied marks fit their stored field box", () => {
  const cases: Array<["SIGNATURE" | "INITIALS", string, { width: number; height: number }]> = [
    ["INITIALS", "T", INITIALS_DEFAULT],
    ["INITIALS", "TLH", INITIALS_DEFAULT],
    ["INITIALS", "MJKSW", { width: 24, height: 16 }],
    ["INITIALS", "WMW", { width: 16, height: 20 }],
    ["SIGNATURE", "Avery Jordan Stone", { width: 150, height: 28 }],
    ["SIGNATURE", "Lisa Ann Ellison Hernandez-Whitfield", { width: 90, height: 22 }],
  ];

  it("typed Signature and Initials never exceed the box width or height", async () => {
    const { caveat } = await pdfFonts();
    for (const [kind, text, box] of cases) {
      const layout = appliedMarkLayout(kind, text, box);
      assert.ok(layout.x + layout.textWidth <= box.width + 0.01, `${text} width ${layout.textWidth} > ${box.width}`);
      const descent = Math.abs(caveat.heightAtSize(layout.fontSize, { descender: true }) - caveat.heightAtSize(layout.fontSize, { descender: false }));
      assert.ok(layout.baseline + descent <= box.height + 0.5, `${text} height`);
    }
  });

  it("Date Signed shows the whole date inside the box padding, narrow boxes included", () => {
    for (const box of [DATE_SIGNED_DEFAULT_SIZE, { width: 40, height: 17 }, { width: 30, height: 12 }, { width: 96, height: 20 }]) {
      const layout = appliedMarkLayout("DATE_SIGNED", DATE, box);
      assert.ok(layout.x >= 2 - 0.01 || layout.textWidth <= box.width - 4 + 0.01, `date x in ${box.width}`);
      assert.ok(layout.x + layout.textWidth <= box.width + 0.01, `date width in ${box.width}`);
      assert.ok(Math.abs(layout.x * 2 + layout.textWidth - box.width) < 0.01, "date centred");
    }
  });

  it("uses exactly the completed-PDF renderer's font sizes, measured with the embedded fonts", async () => {
    const { caveat, helvetica } = await pdfFonts();
    for (const [kind, text, box] of cases) {
      const base = typedSignatureFontSize(box.height);
      const pdfSize = fitTypedSignatureFontSize({
        text,
        boxWidth: box.width,
        boxHeight: box.height,
        measureWidth: (value) => caveat.widthOfTextAtSize(value, base),
      });
      assert.ok(Math.abs(appliedMarkLayout(kind, text, box).fontSize - pdfSize) < 0.05, `${text} size`);
    }
    for (const box of [DATE_SIGNED_DEFAULT_SIZE, { width: 40, height: 17 }, { width: 30, height: 12 }]) {
      const pdfSize = fitDateSignedFontSize({
        text: DATE,
        boxWidth: box.width,
        boxHeight: box.height,
        measureWidth: (value, size) => helvetica.widthOfTextAtSize(value, size),
      });
      const layout = appliedMarkLayout("DATE_SIGNED", DATE, box);
      assert.ok(Math.abs(layout.fontSize - pdfSize) < 0.01, `date size in ${box.width}`);
      assert.ok(Math.abs(layout.textWidth - helvetica.widthOfTextAtSize(DATE, pdfSize)) < 0.05, "date width");
    }
  });

  it("does not shrink marks that already fit (default boxes keep their size)", () => {
    const date = appliedMarkLayout("DATE_SIGNED", DATE, DATE_SIGNED_DEFAULT_SIZE);
    assert.equal(date.fontSize, Math.min(11, Math.max(7, DATE_SIGNED_DEFAULT_SIZE.height * 0.55)));
    const initials = appliedMarkLayout("INITIALS", "TLH", INITIALS_DEFAULT);
    assert.equal(initials.fontSize, typedSignatureFontSize(INITIALS_DEFAULT.height));
  });

  it("is independent of zoom: the layout is in PDF points and scaled by the SVG viewBox", () => {
    const viewer = read("components/sign/ceremony-document-viewer.tsx");
    const mark = functionSource(viewer, "AppliedMarkText");
    assert.match(mark, /viewBox=\{`0 0 \$\{field\.width\} \$\{field\.height\}`\}/);
    assert.match(mark, /appliedMarkLayout\(kind, text, field\)/);
    assert.match(mark, /overflow-visible/);
    assert.match(mark, /textLength=\{layout\.textWidth > 0 \? layout\.textWidth : undefined\}/);
    assert.match(mark, /lengthAdjust="spacingAndGlyphs"/);
    assert.match(mark, /textRendering="geometricPrecision"/);
    assert.match(mark, /HarbaughCaveat/);
    assert.match(mark, /Helvetica, Arial/);
  });

  it("never truncates an applied mark in the ceremony overlay", () => {
    const viewer = read("components/sign/ceremony-document-viewer.tsx");
    const target = functionSource(viewer, "CeremonyFieldTarget");
    const placedDate = target.slice(target.indexOf("if (field.placementId && field.renderedSenderLocalDate)"), target.indexOf("return (", target.indexOf("if (field.placementId && field.renderedSenderLocalDate)") + 120));
    assert.match(placedDate, /<AppliedMarkText kind="DATE_SIGNED"/);
    assert.doesNotMatch(placedDate, /truncate|overflow-hidden|px-1/);
    const placedMark = target.slice(target.indexOf("if (field.placementId) {"), target.indexOf("const markReady"));
    assert.match(placedMark, /<AppliedMarkText kind=\{field\.fieldType\}/);
    assert.doesNotMatch(placedMark, /truncate|overflow-hidden|px-1|text-overflow|ellipsis/);
    assert.doesNotMatch(viewer, /markFontPx/);
  });

  it("the completed PDF fits Date Signed with the shared rule", () => {
    const pdf = read("lib/signing/completed-pdf.ts");
    const draw = functionSource(pdf, "drawDateSigned");
    assert.match(draw, /fitDateSignedFontSize\(/);
    assert.doesNotMatch(draw, /options\.height \* 0\.55/);
    assert.match(functionSource(pdf, "drawTypedMark"), /fitTypedSignatureFontSize\(/);
  });
});

describe("Your fields is docked or reachable at every width", () => {
  it("docks only when a usable document column remains beside the panel", () => {
    assert.equal(CEREMONY_DOCK_MIN_WIDTH_PX, CEREMONY_FIELDS_PANEL_WIDTH_PX + CEREMONY_MIN_DOCUMENT_WIDTH_PX);
    for (const width of [1440, 1280, 1200, 1100, 1050, 1024]) {
      assert.equal(ceremonyFieldsPanelMode(width), "docked", String(width));
    }
    for (const width of [1023, 1000, 960, 900, 820, 768, 600, 390, 0, Number.NaN]) {
      assert.equal(ceremonyFieldsPanelMode(width), "drawer", String(width));
    }
  });

  it("one measured mode drives the panel, its toggle and the grid (no media-query split)", () => {
    const shell = read("components/sign/ceremony-shell.tsx");
    assert.doesNotMatch(shell, /lg:hidden|lg:flex|lg:static|lg:grid-cols/);
    assert.match(shell, /new ResizeObserver\(update\)/);
    assert.match(shell, /ceremonyFieldsPanelMode\(shellElement\.getBoundingClientRect\(\)\.width\)/);
    assert.match(shell, /const drawerOpen = !docked && fieldsPanelOpen;/);
    assert.match(shell, /\{docked \? null : \(\s*<Button\s*ref=\{fieldsToggleRef\}/);
    assert.match(shell, /docked \? "grid-cols-\[minmax\(0,1fr\)_20rem\]" : "grid-cols-1"/);
    assert.match(shell, /<div className="min-h-0 min-w-0">\s*<CeremonyDocumentViewer/);
    assert.match(shell, /className="flex h-dvh flex-col overflow-x-clip"/);
  });

  it("the drawer takes focus, closes on Escape and returns focus to its toggle", () => {
    const shell = read("components/sign/ceremony-shell.tsx");
    assert.match(shell, /if \(!drawerOpen\) return;\s*fieldsCloseRef\.current\?\.focus\(\);/);
    assert.match(shell, /event\.key !== "Escape"/);
    assert.match(shell, /function closeFieldsDrawer\(\) \{\s*setFieldsPanelOpen\(false\);\s*fieldsToggleRef\.current\?\.focus\(\);/);
    assert.match(shell, /aria-controls="ceremony-your-fields"/);
    assert.match(shell, /aria-expanded=\{drawerOpen\}/);
  });
});

describe("Manager Signing page follows changes made elsewhere", () => {
  const participant = (fullName: string, participantStatus: string) => ({ fullName, participantStatus }) as never;
  const dashboard = (lifecycleState: string, participants: unknown[]) =>
    ({ signing: { lifecycleState }, participants }) as never;

  it("watches only an In Progress Signing; terminal and Draft states stop it", () => {
    assert.equal(shouldWatchSigningState("IN_PROGRESS"), true);
    for (const state of ["DRAFT", "COMPLETE", "DECLINED", "CANCELLED"]) {
      assert.equal(shouldWatchSigningState(state), false, state);
    }
  });

  it("polls gently (15–30 s), not every second or two", () => {
    assert.ok(SIGNING_STATE_POLL_MS >= 15_000 && SIGNING_STATE_POLL_MS <= 30_000);
  });

  it("names who declined, and says Cancelled only for a cancellation", () => {
    const declined = signingOutcomeMessage(dashboard("DECLINED", [participant("Avery Stone", "FINISHED"), participant("Casey Decliner", "DECLINED")]), null);
    assert.equal(declined?.title, "This Signing was declined by Casey Decliner.");
    assert.match(declined?.body ?? "", /prepare and send a new Signing/);
    assert.doesNotMatch(`${declined?.title} ${declined?.body}`, /cancel/i);
    assert.equal(signingOutcomeMessage(dashboard("CANCELLED", []), null)?.title, "This Signing was cancelled.");
    assert.equal(signingOutcomeMessage(dashboard("CANCELLED", []), "Signing cancelled. Create a new Signing to send corrected documents."), null);
    for (const state of ["IN_PROGRESS", "COMPLETE", "DRAFT"]) {
      assert.equal(signingOutcomeMessage(dashboard(state, []), null), null, state);
    }
  });

  it("the watcher only triggers an authoritative refresh; it never overlaps, and it cleans up", () => {
    const hook = read("components/signings/use-signing-state-watcher.ts");
    assert.match(hook, /window\.setInterval\(\(\) => run\(true\), intervalMs\)/);
    assert.match(hook, /if \(stopped \|\| inFlight \|\| document\.visibilityState !== "visible"\) return;/);
    assert.match(hook, /addEventListener\("visibilitychange", onReveal\)/);
    assert.match(hook, /addEventListener\("focus", onFocus\)/);
    assert.match(hook, /window\.clearInterval\(timer\)/);
    assert.match(hook, /removeEventListener\("visibilitychange", onReveal\)/);
    assert.match(hook, /if \(!active\) return;/);
    assert.doesNotMatch(hook, /createClient|supabase|fetch\(/i);
  });

  it("the dashboard refreshes through the authorized load and drops stale responses", () => {
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(page, /useSigningStateWatcher\(\{\s*active: dashboard\s*\? shouldWatchSigningState\(dashboard\.signing\.lifecycleState, dashboard\.completedArtifactsSettled\)\s*: false,\s*refresh: reload,\s*\}\)/);
    assert.match(page, /const loadSeq = \+\+loadSeqRef\.current;\s*const result = await getSigningDashboardAction\(\{ signingId \}\);\s*if \(loadSeq !== loadSeqRef\.current\) return;/);
    const actions = read("lib/signing/stage4-actions.ts");
    assert.match(actions, /export async function getSigningDashboardAction[\s\S]*?withAuthorizedAdmin\(\(actor, admin\) =>\s*loadSigningDashboardForActor\(actor, input\.signingId, admin\)/);
    assert.match(page, /data-testid="signing-outcome"/);
  });
});
