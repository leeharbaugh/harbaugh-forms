# TXR-1605 Condominium Contract import manifest

`manifest.json` is the single reproducible source of truth for standing up the
**Residential Condominium Contract (Resale)** (TREC 30-18 / TXR 1605, revision
05-04-2026) as a GLOBAL form: the form record, the 13 new Global field
definitions it needs, and all 158 field mappings with their PDF placements.

It is data only. Nothing here writes to a database, uploads to storage, or
touches production.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | The manifest itself. Hand-review this; it is what an importer consumes. |
| `build-manifest.mjs` | Regenerates `manifest.json` from `assets/forms/CondoListing.pdf` geometry plus the audit artifacts in `_audit_tmp/`. |

Regenerate with:

```bash
node data/condo-txr-1605/build-manifest.mjs
```

The build script fails loudly if any reused `field_key` is missing from
`_audit_tmp/active_global_fields.json` or is not `ACTIVE` / `GLOBAL`, so it
doubles as a validation pass.

## What is in the manifest

- **`form.stableIdentity`** — resolve the form by `form_code` + `version_label` +
  `form_name`, never by numeric ID. Development and production IDs differ.
- **`form.pdf`** — local path, storage path template, byte length, and MD5/SHA-256
  of the approved PDF. Verify the hashes before uploading; the file has 10 pages
  and 0 AcroForm fields.
- **`newFields`** — the 13 condo-specific Global fields. Twelve are `manual_only`
  with null `source_path` / `resolver_key`; `contract_condo_unit_number` binds to
  `packet_property.unit`, which already exists, so no migration is required.
- **`mappings`** — one row per PDF blank. Each carries `field_key`,
  `reuseOrNew`, `existing_field_id` for reuses, widget type, resolved source
  metadata, the rectangle, and a note explaining where the placement came from.
- **`deviations`** — every intentional difference from the raw field-inventory
  audit and from Form 11 (TXR-1601) parity.
- **`expectedCounts`** — the numbers an import run must reproduce exactly.

## Coordinate convention

`x` / `y` are measured from the **top-left** of the page in PDF points on a
612 x 792 letter page, matching the existing Form 11 mappings. Placements were
derived from the actual `CondoListing.pdf` rule and text geometry rather than
copied from Form 11, because the condo form is 10 pages against Form 11's 12 and
the paragraph-to-page alignment differs. Treat them as good starting rectangles
that Lee finalizes in Map Fields.

Text boxes are 14 pt tall, checkboxes are 12 x 12. Multi-line blanks are mapped
as a single field on the first line, per Form 11 practice.

## How to apply

1. Verify the PDF hashes in `form.pdf` against `assets/forms/CondoListing.pdf`.
2. Resolve or create the GLOBAL form row by stable identity. Do not reuse the
   existing condo *listing addendum* forms (TXR-1401); they are a different form.
3. Upload the PDF to `global/forms/{formId}/CondoListing.pdf`.
4. Insert the 13 `newFields` as Global catalog rows. Skip any that already exist.
5. Reuse the 145 existing Global fields by `existing_field_id`; do **not**
   duplicate catalog rows for them.
6. Insert the 158 mappings.
7. Verify against `expectedCounts`, confirm the PDF still reports 0 AcroForm
   fields, then smoke-test Map Fields and Fill Form.

No defaults are included at any level. Personal and Organization defaults are set
later in Map Fields.

Rollback is soft-delete only: soft-delete the mappings, then the new fields, then
the form. Do not hard-delete and do not edit applied migrations.

## Promoting to production

Production is a separate, explicitly approved task. Resolve the production form
by stable identity, reuse matching ACTIVE Global fields, insert only missing
ones, and upsert mappings onto the existing form rather than inserting a
duplicate. Promote placements and defaults only after development editing is
finished, and never rewrite historical `field_instances`.
