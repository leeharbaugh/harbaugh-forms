import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { CeremonyFieldView } from "./ceremony-context";
import {
  ceremonyDocumentUrl,
  ceremonyFieldRenderRect,
  ceremonyTargetAccessibleName,
  nextIncompleteCeremonyField,
  orderCeremonyFields,
  type CeremonyActionableField,
} from "./ceremony-field-view";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function filesUnder(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(join(root, directory))) {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) files.push(...filesUnder(path));
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}

const field = (
  overrides: Partial<CeremonyFieldView> & Pick<CeremonyFieldView, "fieldId" | "fieldType">,
): CeremonyFieldView => ({
  revisionDocumentId: "doc-a",
  isRequired: true,
  pageNumber: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  linkedSignatureFieldId: null,
  placementId: null,
  acceptedAt: null,
  renderedSenderLocalDate: null,
  ...overrides,
});

const documents = [
  { revisionDocumentId: "doc-b", displayOrder: 2 },
  { revisionDocumentId: "doc-a", displayOrder: 1 },
];

describe("Ceremony document view: geometry and navigation", () => {
  it("scales stored PDF-point geometry (top-left origin) to the rendered page without inflating it", () => {
    const rect = ceremonyFieldRenderRect(
      { x: 72, y: 600, width: 180, height: 24 },
      { originalWidth: 612, originalHeight: 792, renderedWidth: 918, renderedHeight: 1188 },
    );
    assert.deepEqual(rect, { x: 108, y: 900, width: 270, height: 36 });
  });

  it("uses the same convention as the manager preview and the completed-PDF renderer", () => {
    const preview = read("components/signings/signing-preview-dialog.tsx");
    assert.match(preview, /y: \(field\.y \/ metrics\.originalHeight\) \* metrics\.renderedHeight/);
    const completed = read("lib/signing/completed-pdf.ts");
    assert.match(completed, /const yFromTop = Number\(field\.y\);/);
  });

  it("orders fields by document display order, page, then position", () => {
    const ordered = orderCeremonyFields(
      [
        field({ fieldId: "b1", fieldType: "SIGNATURE", revisionDocumentId: "doc-b" }),
        field({ fieldId: "a2-low", fieldType: "INITIALS", pageNumber: 2, y: 500 }),
        field({ fieldId: "a2-high", fieldType: "INITIALS", pageNumber: 2, y: 100 }),
        field({ fieldId: "a1", fieldType: "SIGNATURE" }),
      ],
      documents,
    );
    assert.deepEqual(
      ordered.map((entry) => entry.fieldId),
      ["a1", "a2-high", "a2-low", "b1"],
    );
  });

  it("advances to the next incomplete Signature / Initials, wraps, and never targets Date Signed", () => {
    const fields = [
      field({ fieldId: "a1", fieldType: "SIGNATURE", placementId: "p1" }),
      field({ fieldId: "a1-date", fieldType: "DATE_SIGNED", linkedSignatureFieldId: "a1", y: 1 }),
      field({ fieldId: "a2", fieldType: "INITIALS", pageNumber: 2 }),
      field({ fieldId: "b1", fieldType: "SIGNATURE", revisionDocumentId: "doc-b" }),
    ];
    assert.equal(nextIncompleteCeremonyField(fields, documents)?.fieldId, "a2");
    assert.equal(nextIncompleteCeremonyField(fields, documents, "a2")?.fieldId, "b1");
    assert.equal(nextIncompleteCeremonyField(fields, documents, "b1")?.fieldId, "a2");
    assert.equal(
      nextIncompleteCeremonyField(
        fields.map((entry) => ({ ...entry, placementId: entry.placementId ?? "done" })),
        documents,
      ),
      null,
    );
  });

  it("names on-document targets by action, kind, page, document and requirement", () => {
    const signature = field({ fieldId: "s", fieldType: "SIGNATURE", pageNumber: 3 }) as CeremonyActionableField;
    const initials = field({ fieldId: "i", fieldType: "INITIALS", isRequired: false }) as CeremonyActionableField;
    assert.equal(
      ceremonyTargetAccessibleName(signature, "Purchase Contract"),
      "Sign here: Signature, page 3 of Purchase Contract, required",
    );
    assert.equal(
      ceremonyTargetAccessibleName(initials, "Addendum"),
      "Initial here: Initials, page 1 of Addendum, optional",
    );
  });

  it("builds a secret-free, server-mediated document path", () => {
    assert.equal(
      ceremonyDocumentUrl("0b9f0a52-1c1e-4b7e-9a51-2f6f1d1a4a10"),
      "/sign/ceremony/document/0b9f0a52-1c1e-4b7e-9a51-2f6f1d1a4a10",
    );
    assert.equal(ceremonyDocumentUrl("a/b#c"), "/sign/ceremony/document/a%2Fb%23c");
  });
});

describe("Ceremony document serving boundary", () => {
  const route = read("app/sign/ceremony/document/[revisionDocumentId]/route.ts");
  const documentsModule = read("lib/signing/ceremony-documents.ts");
  const context = read("lib/signing/ceremony-context.ts");

  it("authorizes from the ceremony session before reading any bytes", () => {
    assert.match(route, /cookieStore\.get\(SIGNING_CEREMONY_COOKIE_NAME\)/);
    const sessionAt = route.indexOf("await requireCeremonyBrowserSession(admin, rawSessionToken)");
    const bytesAt = route.indexOf("await loadCeremonyDocumentBytes(");
    assert.ok(sessionAt > 0 && bytesAt > sessionAt);
    assert.match(route, /if \(!rawSessionToken\) \{\s*return notFoundResponse\(\);/);
    assert.match(route, /if \(!isNativeSigningEnabled\(\)\) \{\s*return notFoundResponse\(\);/);
  });

  it("keeps the participant security headers and fails as a bare 404", () => {
    for (const header of [
      /"Cache-Control": "no-store"/,
      /"Referrer-Policy": "no-referrer"/,
      /"X-Robots-Tag": "noindex, nofollow"/,
      /"X-Content-Type-Options": "nosniff"/,
    ]) {
      assert.match(route, header);
    }
    assert.match(route, /catch \(error\) \{[\s\S]*return notFoundResponse\(\);/);
  });

  it("logs integrity and infrastructure failures but not routine authorization denials", () => {
    assert.match(
      documentsModule,
      /return error instanceof SigningError && error\.code !== "INTEGRITY_MISMATCH";/,
    );
    assert.match(route, /!isRoutineCeremonyDocumentDenial\(error\) &&[\s\S]*console\.error\(/);
    assert.doesNotMatch(route, /console\.(error|warn|log)\([^)]*rawSessionToken/);
  });

  it("serves only the prepared version frozen by this participant's actionable revision", () => {
    assert.match(documentsModule, /const packageRevisionId = resolveActionableRevisionId\(session\);/);
    assert.match(
      documentsModule,
      /from\("signing_package_revision_participants"\)[\s\S]*?\.eq\("signing_id", session\.signingId\)[\s\S]*?\.eq\("package_revision_id", packageRevisionId\)[\s\S]*?\.eq\("signing_participant_id", session\.signingParticipantId\)/,
    );
    assert.match(
      documentsModule,
      /from\("signing_package_revision_documents"\)[\s\S]*?\.eq\("id", options\.revisionDocumentId\)[\s\S]*?\.eq\("signing_id", session\.signingId\)[\s\S]*?\.eq\("package_revision_id", packageRevisionId\)/,
    );
    assert.match(
      documentsModule,
      /from\("signing_document_versions"\)[\s\S]*?\.eq\("id", versionId\)[\s\S]*?\.eq\("signing_id", session\.signingId\)/,
    );
    assert.match(documentsModule, /!isPreparedVersionObjectKey\(objectKey\)/);
    assert.match(documentsModule, /if \(actualSha256 !== expectedSha256\)/);
    assert.match(documentsModule, /if \(!isUuid\(options\.revisionDocumentId\)\)/);
  });

  it("sends the browser only this participant's own fields", () => {
    assert.match(
      context,
      /from\("signing_fields"\)[\s\S]*?\.eq\("signing_id", session\.signingId\)[\s\S]*?\.eq\("package_revision_id", packageRevisionId\)[\s\S]*?\.eq\("package_revision_participant_id", revisionParticipantId\)/,
    );
  });

  it("never issues Storage URLs to participant code", () => {
    const participantFiles = [
      ...filesUnder(join("app", "sign")),
      ...filesUnder(join("components", "sign")),
      join("lib", "signing", "ceremony-documents.ts"),
      join("lib", "signing", "ceremony-field-view.ts"),
    ];
    for (const path of participantFiles) {
      const source = read(path);
      assert.doesNotMatch(source, /createSignedUrl|getPublicUrl|\/storage\/v1\//, path);
    }
    const viewer = read("components/sign/ceremony-document-viewer.tsx");
    assert.doesNotMatch(viewer, /supabase/i);
    assert.match(viewer, /file=\{file\}/);
    assert.match(viewer, /ceremonyDocumentUrl\(documentId\)/);
  });
});

describe("Ceremony document viewer UI", () => {
  const shell = read("components/sign/ceremony-shell.tsx");
  const viewer = read("components/sign/ceremony-document-viewer.tsx");

  it("loads the PDF viewer client-only and without an eval probe", () => {
    assert.doesNotMatch(shell, /^import (?!type).*ceremony-document-viewer/m);
    assert.match(
      shell,
      /dynamic\(\s*\(\) => import\("@\/components\/sign\/ceremony-document-viewer"\),\s*\{\s*ssr: false/,
    );
    assert.match(viewer, /const PDF_OPTIONS = \{ isEvalSupported: false \} as const;/);
    assert.match(viewer, /options=\{PDF_OPTIONS\}/);
  });

  it("serves the pdf.js worker without a workspace session", () => {
    const proxy = read("proxy.ts");
    const matcher = proxy.match(/matcher: \[[\s\S]*?"(\/\(\(\?![^"]+)"/)?.[1];
    assert.ok(matcher, "proxy matcher not found");
    const pattern = new RegExp(`^${matcher.replace(/\\\\/g, "\\")}$`);
    assert.ok(!pattern.test("/pdf.worker.min.mjs"), "the proxy must not gate /pdf.worker.min.mjs");
    assert.ok(pattern.test("/sign/ceremony"));
    assert.ok(pattern.test("/signings/abc"));
  });

  it("shows every document, not only those with this participant's fields", () => {
    assert.match(viewer, /\{documents\.map\(\(document, index\) =>/);
    assert.doesNotMatch(viewer, /documents\.filter\(/);
    assert.match(shell, /documents=\{overview\.documents\}/);
  });

  it("acts through the existing trusted placement action only for Signature / Initials", () => {
    assert.match(viewer, /if \(!isParticipantActionableField\(field\)\) \{/);
    assert.match(viewer, /onClick=\{\(\) => onPlace\(field\)\}/);
    assert.match(shell, /placeCeremonyFieldAction\(\{\s*signingFieldId: field\.fieldId,/);
    assert.doesNotMatch(viewer, /ceremony-actions/);
  });

  it("never offers a Date Signed control", () => {
    const dateBranch = viewer.slice(
      viewer.indexOf("if (!isParticipantActionableField(field)) {"),
      viewer.indexOf("if (field.placementId) {"),
    );
    assert.match(dateBranch, /pointer-events-none/);
    assert.doesNotMatch(dateBranch, /<button|onClick/);
  });
});

describe("Typed Signature adoption is read-only and exact", () => {
  const shell = read("components/sign/ceremony-shell.tsx");
  const adoptedMarks = read("lib/signing/adopted-marks.ts");

  it("pre-populates the read-only field with the exact Signing name and adopts that value", () => {
    assert.match(
      shell,
      /const expectedSignatureText =\s*overview\.expectedTypedSignatureText \|\| overview\.displayedName;/,
    );
    const signatureInput = shell.slice(
      shell.indexOf('id="typed-signature"'),
      shell.indexOf("/>", shell.indexOf('id="typed-signature"')),
    );
    assert.match(signatureInput, /value=\{expectedSignatureText\}/);
    assert.match(signatureInput, /readOnly/);
    assert.doesNotMatch(signatureInput, /onChange/);
    assert.doesNotMatch(shell, /setTypedSignature/);
    assert.match(
      shell,
      /markKind: "SIGNATURE",\s*representationType: "TYPED",\s*typedText: expectedSignatureText,/,
    );
  });

  it("keeps Initials editable before first use", () => {
    const initialsInput = shell.slice(
      shell.indexOf('id="typed-initials"'),
      shell.indexOf("/>", shell.indexOf('id="typed-initials"')),
    );
    assert.match(
      initialsInput,
      /onChange=\{\(event\) => \{\s*setInitialsPrefilled\(true\);\s*setTypedInitials\(event\.target\.value\);/,
    );
    assert.doesNotMatch(initialsInput, /readOnly/);
    // A background overview refresh must never overwrite what the participant typed.
    assert.match(
      shell,
      /useState\(\s*Boolean\(initialOverview\.suggestedTypedInitials\),\s*\)/,
    );
  });

  it("still requires the server-side typed Signature to equal the Signing name exactly", () => {
    assert.match(
      adoptedMarks,
      /const expected = context\.expectedTypedSignatureText\.trim\(\);\s*if \(!expected \|\| typedText !== expected\) \{/,
    );
  });
});
