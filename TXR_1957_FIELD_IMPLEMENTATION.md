# TXR-1957 / T-47.1 — Production Field Implementation

**Date:** 2026-08-17  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified (form shell is production-only)  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **53** |
| Stable identity | `form_code=TXR-1957`, `version_label=TXR-1957-11-1-2024`, `form_family_key=TXR-1957` |
| Title | T-47 In Lieu of Affidavit |
| Form number / revision | TXR-1957 / T-47.1 / effective November 1, 2024 |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |
| Copied from | DELETED Private form **52** (same PDF; not mapped) |

Exactly one ACTIVE match. Form **52** remains DELETED PRIVATE with 0 ACTIVE mappings.

---

## PDF (authoritative Storage object)

| Item | Value |
|------|-------|
| Storage path | `global/forms/53/T-47-not-affidavit.pdf` |
| Bytes | 159938 |
| MD5 | `779f199830e4d6a470654b67d46fb93f` |
| SHA-256 | `003824479b864953e9c60fc689c6ddcc7f0fcc6306c4b23f67546384ae7a21ff` |
| Pages | 2 (612×792) |
| AcroForm fields | **0** |

PDF unchanged. No widget rectangles to reuse.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **23** (p1:7 · p2:16) |
| Reused Global fields | **4** |
| New Global fields | **19** |
| Text widgets | **19** |
| Date widgets | **4** |
| Checkboxes | **0** |
| Automatic sources | **6** |
| manual_only | **17** |
| Signatures / initials | **0** |

---

## Reused Global fields

| field_key | source |
|-----------|--------|
| `property_legal_description` | `packet_property` / `legal_description` |
| `property_county` | `packet_property` / `county` |
| `seller_name_1` | `packet_contact` / `seller_1.full_name` |
| `seller_name_2` | `packet_contact` / `seller_2.full_name` |

Shared Global field metadata was not changed.

---

## New field keys (19)

All Global, no catalog preference literals:

**Page 1:** `txr_1957_declaration_date`, `txr_1957_gf_number`, `txr_1957_declarant`, `txr_1957_survey_date`, `txr_1957_survey_changes_exceptions`

**Declarant 1:** `txr_1957_declarant_1_dob`, `txr_1957_declarant_1_address`, `txr_1957_declarant_1_execution_county`, `txr_1957_declarant_1_execution_state`, `txr_1957_declarant_1_execution_day`, `txr_1957_declarant_1_execution_month`, `txr_1957_declarant_1_execution_year`

**Declarant 2:** matching `txr_1957_declarant_2_*` keys

DOB fields are `packet_contact` / `seller_N.date_of_birth` (contacts already store DOB). All other new fields are `manual_only`.

---

## Excluded

- Declarant 1 **Signed** line
- Declarant 2 **Signed** line
- No initials on the PDF

---

## Lee Personal form-specific defaults (form_id = 53)

| Field | Value |
|-------|-------|
| `txr_1957_survey_changes_exceptions` | `None` |
| `txr_1957_declarant_1_execution_state` | `Texas` |
| `txr_1957_declarant_2_execution_state` | `Texas` |

PRIVATE, Lee only, mapping_id null. No Organization or Global defaults.

---

## Intentionally left manual

- Page 1 **Declarant** — `seller_names` resolver was removed; this blank may list both owners.
- **Addresses** — live `seller_N.address` is street lines only, not city/state/ZIP.
- Declaration date, GF number, survey date, execution county, and day/month/year — no live canonical source.

---

## Isolation

| Check | Result |
|-------|--------|
| Form remains ACTIVE + DRAFT | Yes |
| PDF checksum unchanged | Yes |
| Packets / packet_forms / field_instances | 9 / 28 / 528 fingerprint `6067a650…f320c7` unchanged |
| Other-form ACTIVE mappings | 2075 unchanged |
| ACTIVE fields | 1509 → 1528 (+19) |
| ACTIVE defaults | 106 → 109 (+3 Lee Personal) |
| Form 52 | untouched |

---

## Validation

`test:txr-1957-manifest` 11; `test:field-instance-sync` 17; `test:source-registry-cleanup` 10; `test:field-defaults` 77; `tsc --noEmit`; targeted ESLint; `build:validate`; production phase-6 verify `ok: true`.

Visual overlays: `_audit_tmp/txr1957/annotated-page-{1,2}.png`. Lee Map Fields review still required at `/forms/53/editor`. **Do not publish.**
