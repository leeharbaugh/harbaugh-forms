# Production Multiline / Mask Background Mapping Audit

**Date:** 2026-08-06 (America/Chicago) / 2026-08-07 UTC
**Scope:** Read-only audit of ALL ACTIVE forms and text-like mappings on `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`).
**Approved app commit (runtime):** `d93cc5936f511c561f7538a5d035126ed2976cc9`
**No production writes were performed.**

## Method

- Exported ACTIVE forms/fields/mappings from production (read-only).
- Downloaded each ACTIVE form template from `form-templates` storage into a local cache only (no template mutation).
- Decoded page content streams (`decodePDFRawStream`) and counted horizontal `re`/`m l` geometry intersecting each placement box where vector content exists.
- Used AcroForm multiline flags when present; many TXR templates are flat (no AcroForm).
- **Limitation:** some templates (notably TXR-2216 / form 51) expose almost no page-content vectors (decoded page stream ~742 bytes, 0 AcroForm fields). Writing lines there are not detectable as path geometry; recommendations for those fields rely on placement size, mapping notes (underline/glyph-derived), and known form purpose.
- Classified recommendations using PDF geometry + business purpose; did **not** enable multiline merely because a preview value wraps.
- Multiline and masking evaluated separately (mask only with legitimate multiline + writing-line evidence or confirmed lined narrative blocks).

## Summary

| Metric | Count |
|--------|------:|
| ACTIVE forms in production | 47 |
| ACTIVE forms with ≥1 text-like mapping audited | 44 |
| Text-like mappings audited | 1275 |
| Currently is_multiline=true | 1 |
| Currently mask_background=true | 1 |
| Recommended is_multiline=true | 159 |
| Recommended mask_background=true | 15 |
| Possible dimension adjustments | 112 |
| Mappings with geometry line hits > 0 | 276 |
| HIGH CONFIDENCE | 4 |
| MEDIUM CONFIDENCE | 42 |
| REVIEW REQUIRED | 118 |
| LEAVE UNCHANGED | 1111 |

## Baseline integrity

### Before
```json
{
  "project": "harbaugh-forms-prod",
  "ref": "eetonalyyyssvkyfdoxh",
  "captured_at": "2026-08-07T00:20:57.527Z",
  "forms_active": 47,
  "fields_active": 1509,
  "mappings_active": 2076,
  "packets": 7,
  "packet_forms": 20,
  "field_instances": 248,
  "annotations_active": 2,
  "generated_documents_storage_objects": null,
  "field_instances_fingerprint": "381dc622427952a1bec693b842efb0d1",
  "mappings_presentation_fingerprint": "3705ac21a760696723f9f7b7458129b7",
  "mappings_active_rows_fingerprinted": 2076
}
```

### After (must match fingerprints/counts)
```json
{
  "forms_active": 47,
  "fields_active": 1509,
  "mappings_active": 2076,
  "packets": 7,
  "packet_forms": 20,
  "field_instances": 248,
  "annotations_active": 2,
  "field_instances_fingerprint": "381dc622427952a1bec693b842efb0d1",
  "mappings_presentation_fingerprint": "3705ac21a760696723f9f7b7458129b7"
}
```

**Integrity check: PASS — no production data changed during this audit.**

## Summary by form

- **Form 1** — Buyer Rep Agreement (`TXR-1501`): text 40; rec ML 2; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 1
- **Form 3** — IABS (`TXR-2501`): text 12; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 5** — TILA-RESPA (`TXR-2516`): text 11; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 6** — Wire Fraud Warning (`TXR-2517`): text 1; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 7** — Listing Agreement (`TXR-1101`): text 59; rec ML 24; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 23
- **Form 8** — Request for Info From HOA (`TXR-1405`): text 12; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 9** — Lead Based Paint Addendum (`TXR-1906`): text 4; rec ML 4; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 4
- **Form 11** — One to Four Residential (`TXR-1601`): text 112; rec ML 5; rec mask 1; HIGH 0; MEDIUM 3; REVIEW 2
- **Form 12** — Addendum for Property Subject to Mandatory Membership in a Property Owners Association (`TXR-1922`): text 7; rec ML 2; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 2
- **Form 13** — Amendment to Listing Agreement (`TXR-1404`): text 17; rec ML 2; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 1
- **Form 14** — Amendment to Contract (`TXR-1903`): text 20; rec ML 1; rec mask 1; HIGH 1; MEDIUM 0; REVIEW 1
- **Form 15** — Residential Lease Listing (`TXR-1102`): text 98; rec ML 11; rec mask 1; HIGH 0; MEDIUM 4; REVIEW 6
- **Form 16** — Amendment to Lease Listing (`TXR-1423`): text 20; rec ML 2; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 1
- **Form 17** — Third Party Financing Addendum (`TXR-1901`): text 46; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 18** — Residential Lease (`TXR-2001`): text 70; rec ML 12; rec mask 0; HIGH 0; MEDIUM 3; REVIEW 9
- **Form 20** — Residential Condominium Contract (Resale) (`TXR-1605`): text 111; rec ML 6; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 6
- **Form 24** — Condominium Addendum to Listing (`TXR-1401`): text 9; rec ML 2; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 2
- **Form 25** — Condominium Resale Certificate (`TXR-1921`): text 44; rec ML 5; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 4
- **Form 26** — Disclosure of Relationship with Contract Provider (`TXR-2513`): text 8; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 27** — NOTICE OF TERMINATION OF RESIDENTIAL LEASING AND PROPERTY MANAGEMENT AGREEMENT (`TXR-2222`): text 4; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 28** — ADDENDUM CONCERNING RIGHT TO TERMINATE DUE TO LENDER'S APPRAISAL (`TXR-1948`): text 4; rec ML 4; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 4
- **Form 29** — ADDENDUM FOR "BACK-UP" CONTRACT (`TXR-1909`): text 7; rec ML 5; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 5
- **Form 30** — ADDENDUM FOR SALE OF OTHER PROPERTY BY BUYER (`TXR-1908`): text 5; rec ML 4; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 4
- **Form 31** — ADDENDUM REGARDING FIXTURE LEASES (`TXR-1954`): text 5; rec ML 5; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 5
- **Form 32** — ADDENDUM REGARDING RESIDENTIAL LEASES (`TXR-1953`): text 4; rec ML 4; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 3
- **Form 33** — AMENDMENT TO BUYER/TENANT REPRESENTATION AGREEMENT (`TXR-1505`): text 21; rec ML 2; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 1
- **Form 34** — AMENDMENT TO FARM AND RANCH LISTING - EXCLUSIVE RIGHT TO SELL (`TXR-1422`): text 17; rec ML 2; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 1
- **Form 35** — ANIMAL AGREEMENT (`TXR-2004`): text 39; rec ML 3; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 2
- **Form 36** — EARLY TERMINATION OF RESIDENTIAL LEASE (`TXR-2012`): text 9; rec ML 1; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 0
- **Form 37** — FARM AND RANCH CONTRACT (`TXR-1701`): text 126; rec ML 12; rec mask 2; HIGH 0; MEDIUM 5; REVIEW 7
- **Form 38** — FARM AND RANCH REAL ESTATE LISTING AGREEMENT - EXCLUSIVE RIGHT TO SELL (`TXR-1201`): text 86; rec ML 8; rec mask 0; HIGH 0; MEDIUM 5; REVIEW 3
- **Form 39** — INTERMEDIARY RELATIONSHIP NOTICE (`TXR-1409`): text 8; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 40** — NON-REALTY ITEMS ADDENDUM (`TXR-1924`): text 3; rec ML 1; rec mask 0; HIGH 0; MEDIUM 1; REVIEW 0
- **Form 41** — NOTICE OF BUYER'S TERMINATION OF CONTRACT (`TXR-1902`): text 3; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 42** — NOTICE OF LANDLORD'S INTENT NOT TO RENEW (`TXR-2217`): text 11; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 43** — NOTICE OF SELLER'S TERMINATION OF CONTRACT (`TXR-1950`): text 3; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 1
- **Form 44** — NOTICE TO PURCHASER OF SPECIAL TAXING OR ASSESSMENT DISTRICT (`TXR-1420`): text 23; rec ML 3; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 3
- **Form 45** — NOTICE OF WITHDRAWAL OF OFFER (`TXR-1945`): text 7; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 46** — RELEASE OF EARNEST MONEY (`TXR-1904`): text 14; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 0
- **Form 47** — RESIDENTIAL LEASING AND PROPERTY MANAGEMENT AGREEMENT (`TXR-2201`): text 86; rec ML 15; rec mask 0; HIGH 0; MEDIUM 4; REVIEW 13
- **Form 48** — SELLER'S TEMPORARY RESIDENTIAL LEASE (`TXR-1910`): text 19; rec ML 1; rec mask 1; HIGH 1; MEDIUM 0; REVIEW 0
- **Form 49** — TERMINATION OF BUYER/TENANT REPRESENTATION AGREEMENT (`TXR-1503`): text 9; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 1
- **Form 50** — TERMINATION OF LISTING (`TXR-1410`): text 10; rec ML 0; rec mask 0; HIGH 0; MEDIUM 0; REVIEW 1
- **Form 51** — Itemization of Security Deposit (`TXR-2216`): text 51; rec ML 11; rec mask 9; HIGH 2; MEDIUM 7; REVIEW 2

## HIGH CONFIDENCE recommendations

| Form | Field key | Mapping | Page | Size | Cur ML/Mask | Rec ML/Mask | Reason |
|------|-----------|---------|-----:|------|-------------|-------------|--------|
| 51 Itemization of Security Deposit | `txr_2216_damages_description` | `08446e94-1227-4645-83ba-646472836831` | 1 | 370.4×63.2 | false/false | **true/true** | Confirmed production problem field: “Damages to the Property, beyond wear and tear (describe)” — large underline-derived narrative block on TXR-2216; needs wrap + white mask over writing lines. Current flags both false. |
| 14 Amendment to Contract | `contract_amend_repairs_text` | `945ac30a-a9d3-4158-ab67-6e5579ec2cf8` | 1 | 356.68×35.28 | false/false | **true/true** | Narrative multi-line area (~3 lines). Preprinted writing lines/underlines indicated in placement (geometry hits=3). |
| 48 SELLER'S TEMPORARY RESIDENTIAL LEASE | `txr_1910_special_provisions` | `c587597d-5840-4c40-9df5-861a308bbc94` | 1 | 518×124 | false/false | **true/true** | Narrative multi-line area (~11 lines). Preprinted writing lines/underlines indicated in placement (geometry hits=4). |
| 51 Itemization of Security Deposit | `txr_2216_other_description` | `fb9a57f5-5bc2-4cb4-9f01-e2365dbc4d54` | 2 | 370.4×100 | false/false | **true/true** | Narrative multi-line area (~9 lines). Preprinted writing lines/underlines indicated in placement (underline/glyph-derived or underscore evidence). |

## MEDIUM CONFIDENCE

- **33** `txr_1505_paragraph_changes_text` `05d1b59e-cb40-4593-b032-1fb85be91ad6` p1 480×50: rec ML=true mask=false. Tall narrative box (~4 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **15** `lease_listing_exclusions` `130d7b31-6f48-4d03-8186-3ed4d6add9f7` p1 281.12×28.21: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **38** `LISTING_EXCLUSIONS` `19b4401c-0c56-4bc0-ac02-ecb3259f0faa` p2 504.1×40: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **38** `txr_1201_property_condition_exceptions` `1a484e0d-693f-476c-bc28-a0afd7ea7faa` p11 400.2×28: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **37** `TXR_1701_EXCEPTION_DOC` `1c523fd3-643d-43aa-8ec1-8d3e0ec94808` p3 218.11×31.43: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **51** `txr_2216_legal_proceeding_description` `2dd72b9d-deb9-475c-bcbd-0da28ede5f1e` p2 370×27.5: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **36** `txr_2012_special_provisions` `334327f4-d309-4009-9ede-13132377a169` p2 500×60: rec ML=true mask=false. Tall narrative box (~5 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **51** `txr_2216_abandoned_property_description` `36327d71-a622-482e-9867-c4bde516a546` p2 368.8×25.6: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **51** `txr_2216_abandoned_vehicles_description` `3ee65ffb-74c7-44ad-8818-a22ea766d638` p2 370×27.5: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **51** `txr_2216_unpaid_utilities_description` `400a8a88-60d5-4b50-83ff-87710788eeb6` p1 240.5×28: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **37** `contract_add_district_notices_text` `450529b9-34bf-442d-86a7-44caf106bc4b` p9 305×25: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **25** `condo_resale_leasehold_renewal_provisions` `45cf1bcc-d472-4718-9749-650f0a2cbc54` p1 486×26: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **47** `lease_non_real_estate_items` `4616f2e2-36da-4682-96f3-fe72b6587393` p1 487.6×39.3: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **15** `lease_requirements_special_provisions` `46ec0932-1d6a-4869-ae2d-b2dee7397f39` p10 408.34×24.11: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **1** `SPECIAL_PROVISIONS` `480eb876-8366-4c59-aaeb-b0000f0a1c68` p5 499.74×59.66: rec ML=true mask=false. Tall narrative box (~4 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **40** `txr_1924_personal_property_description` `542cdc3c-e0ba-4dfa-ab12-9438ca1afb94` p1 502.5×202: rec ML=true mask=false. Tall narrative box (~18 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **16** `lease_listing_amend_paragraph_changes` `577c03df-6fa5-45b2-9f3c-d0dc81f77e18` p1 485×35: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **18** `TXR_2001_TENANT_SPECIFIC_REPAIR_ITEMS` `5f674501-6306-4364-a10c-b2c713fa7a3c` p10 243.77×39.13: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **35** `txr_2004_special_provisions` `620e2866-ad42-4662-878e-facf58d42394` p3 499.74×68.64: rec ML=true mask=false. Tall narrative box (~6 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **37** `contract_add_other_text` `723ff0f1-5191-4838-bff8-213ca0bd8076` p9 435×25: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **37** `TXR_1701_EXCEPTION_DOC_RECORD_REFERENCE` `759cd10a-325e-4323-ab54-84d7ca8f1cec` p3 125.09×28.23: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **32** `txr_1953_representations_exceptions_explain` `77d2de06-437f-465b-8f5b-5e1e738b13e5` p1 500.17×33.86: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **47** `SPECIAL_PROVISIONS` `7c767dc0-3c78-4258-990b-605277dafcb6` p11 522×96: rec ML=true mask=false. Tall narrative box (~8 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **15** `lease_special_provisions` `7d480d19-50b6-463d-93d1-c69f2daa786f` p8 480×60: rec ML=true mask=false. Tall narrative box (~5 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **51** `txr_2216_unpaid_animal_charges_description` `80ec1d77-8a08-4c47-a1a6-de90eb3b9c6b` p1 199.5×27.5: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **34** `txr_1422_paragraph_changes_text` `87f3978b-2c19-4772-9e40-29f889a7d6ba` p1 480×40: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **13** `listing_amendment_paragraph_changes` `8aa0193a-49e5-4179-94f7-cbcad7446111` p1 485×42: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **7** `SPECIAL_PROVISIONS` `a47926b7-f82a-4d88-8e40-eac9c0ca1858` p9 500×60: rec ML=true mask=false. Tall narrative box (~5 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **37** `txr_1701_disclosure_explanation` `a60f12c2-1f3a-48dd-a1b2-649da6bc40d8` p5 510×25: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **38** `SPECIAL_PROVISIONS` `b1064e95-5c32-470a-abc4-a3ac42c6fc9b` p10 522×96: rec ML=true mask=false. Tall narrative box (~8 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **47** `property_legal_description` `b19d8882-64f6-462c-8598-08eca0fa0977` p1 420.3×27.6: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **51** `txr_2216_smoking_damages_description` `b4ef21a3-c071-4de2-847f-55123f5f82e7` p2 367.2×26.4: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **11** `contract_add_district_notices_text` `b561009c-974f-41d4-8b7f-ec26f8281a67` p9 313.44×28.21: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **47** `lease_health_safety_condition_exception` `c9efea1b-ff7f-4e35-b283-753226f64e3b` p8 476×42.34: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **18** `TXR_2001_MOVE_IN_LANDLORD_CONDITIONS` `d695416c-7522-4567-a0df-ffc232f6a69a` p7 486.26×23.74: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **18** `TXR_2001_SPECIAL_PROVISIONS` `d91c2b34-528a-474f-9eca-1d7b336cb54a` p12 504.23×64.15: rec ML=true mask=false. Tall narrative box (~5 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.
- **11** `contract_add_other_text` `d9f39f7e-9204-4513-bf61-9a6531fea92b` p9 440×28: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **38** `txr_1201_acc_other_text` `e1cd03c8-3d9e-40eb-ae89-e20d2b9dd859` p2 314.98×26.16: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **51** `txr_2216_unapproved_alterations_description` `e382bd38-7548-4d32-ac55-c5332e5730bd` p2 364.8×27.2: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **15** `lease_optional_common_area_fees_exception` `ebb1ad66-5cb4-4416-a1c9-625ae64d8d31` p7 369.87×24.11: rec ML=true mask=false. Narrative field with ~2-line capacity; mask not recommended without line evidence.
- **11** `CONTRACT_SPECIAL_PROVISIONS` `ee524f14-559a-49b5-b69d-6aee0c20970f` p6 495.04×23.6: rec ML=true mask=true. Narrative placement with writing-line evidence; enable multiline and mask after quick visual confirm.
- **38** `property_legal_description` `f1c7b788-ba27-40bc-bf86-7bb7ae60451c` p1 504.1×40: rec ML=true mask=false. Tall narrative box (~3 lines) without conclusive line geometry; multiline recommended; mask only after visual confirm of printed lines.

## REVIEW REQUIRED

- **20** `contract_specific_repairs` `001f0f4a-4604-4084-b15e-cd385371cadb` p4 250.8×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **32** `txr_1953_terminate_within_days` `00750a2c-e6d9-4225-b6ab-1ac268be15f5` p1 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `EMPLOYER_RELOCATION_COMPANY` `0351ee67-4061-44a9-8478-a910d4fa5920` p8 360×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **38** `KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION` `0355f7e5-df51-4a98-97c5-aa6b2c6927d7` p9 290×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **38** `KNOWN_LIENS_EXCEPTION` `04413881-25f3-4f67-bbcc-c7fc91a624a5` p9 462×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_add_other_document_description` `050948b0-11da-495f-be93-5f709eafd075` p9 480×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **20** `contract_condo_association_transfer_charges_cap` `0a8b95d4-c5d1-480d-bdf9-ab7164770b2a` p5 94.7×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `txr_1701_surface_oral_leases_description` `0be8dfdc-ab94-4e2f-869b-41bc5ac2a192` p2 476.64×11.55: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.55pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_addendum_custom_3_text` `1272c0b3-a72c-46f5-bcd1-1c6ccca7f71d` p14 215.97×10.77: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 10.77pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **25** `condo_resale_transfer_fee_description_2` `16cbc4b0-cb4f-4e9a-b543-46da9569bb1d` p2 138×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `txr_1701_broker_comp_b_percent` `177053fe-d3c8-42c3-b303-ad3246763f73` p11 34.37×14.88: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.88pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **28** `txr_1948_partial_waiver_opinion_value` `1f7c4340-a91a-4232-aecb-6dd916308df7` p1 102×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `SELLER_ADDRESS` `204bf5d8-a4df-45b8-9fe6-7d6de38ed270` p1 457.59×12.82: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.82pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **30** `PROPERTY_FULL_ADDRESS` `2091ee38-a746-4c77-b08a-c8030aa04e57` p1 510×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **34** `txr_1422_paragraph_numbers` `26f356cd-8615-45c4-b7c2-483e98c66c19` p1 100×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **51** `txr_2216_unauthorized_locks_description` `2859f8cb-6127-4ed9-b5d3-5cd97def88ff` p2 370×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_renewal_fee_other_text` `2e1c7939-3af2-4287-9c33-74b65be84a78` p2 466×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **31** `PROPERTY_FULL_ADDRESS` `2fc78990-e721-40ab-bb89-8a01bba13730` p1 330.38×11.55: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.55pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_yard_maintenance_contract_other` `3039b00c-66ff-44d4-9016-7633b55e6ec5` p8 293×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **12** `hoa_addendum_buyer_delivery_days` `333440fb-ba4a-4d1d-ac05-d75da00e30a2` p1 72×16.8: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16.8pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `mls_delayed_purpose` `343acab2-f835-467f-be14-0f07dfebf119` p4 472.98×13.34: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.34pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **11** `CONTRACT_PROPERTY_EXCLUSIONS` `3594100e-08aa-4909-8988-0357067f767f` p1 500.17×12.82: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.82pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `buyer_broker_comp_flat_fee` `36ba2554-3a2a-4431-8e0a-4bb39d498118` p2 70×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_owner_additional_contact` `37662fd3-2206-4069-b83e-8a89e3331286` p1 348.5×39.3: Tall placement without clear narrative purpose — visual review before enabling multiline.
- **47** `txr_2201_other_fees` `3812d0c1-a61b-4b19-b013-ef63ceea3a06` p4 471.4×64.6: Tall placement without clear narrative purpose — visual review before enabling multiline.
- **28** `txr_1948_appraised_value_less_than` `389c38bf-625c-4b0b-94b3-8f2c9584c8c9` p1 95×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_owner_entity_other_text` `38bb53b8-35a4-4275-af77-907b1b5433b4` p1 165.7×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_health_safety_condition_exception` `3ecc7474-1a04-400c-996d-1a622fa28faa` p7 350.37×21.03: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 21.03pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_add_other_m_text` `4524cbff-bb20-40d0-8002-5c4a0e5f3c63` p11 502×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_rent_due_other_text` `476fabd2-6a4a-44e8-8b5f-fe25f1c54484` p2 452×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **9** `PROPERTY_ADDRESS_CITY` `493ff152-fbc4-4aaa-895a-2963b329b120` p1 330×12: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_leasing_fee_other_text` `4a45a19a-8468-45c4-a00b-7ca4c7ae48d5` p2 466×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **28** `txr_1948_terminate_within_days` `4c6b39b5-e54c-481b-aace-2d1e61f48a87` p1 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_add_other_n_text` `4d31ae31-87b5-401c-871c-3c70e5fbfdf6` p11 502×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_addendum_custom_1_text` `54fe0b2a-be54-4b40-85d5-38824b89ff2d` p14 215.97×12.31: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.31pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **31** `txr_1954_assume_cost_buyer_first` `575de9c9-0b97-4748-8e9f-b37b7a9cd504` p1 90×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **1** `OTHER_DOCUMENT_DESCRIPTION` `575ed17c-c983-4e7f-989f-e651bdca27bf` p5 262.38×14.11: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.11pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `financing_other_description` `59e44d2f-d02e-48ae-93e9-cb04be500025` p7 200×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **44** `txr_1420_bonds_issued_other_description` `59f9250c-f607-4abf-8068-fbc696c0a74c` p1 339.8×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **24** `listing_condo_delinquency_exceptions` `5a227528-7ad9-4e47-8bea-1a586038b9f5` p1 240×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `OTHER_FEES_REIMBURSABLE_EXPENSES` `5e8c93c8-71ee-4050-b434-66c1137b73c2` p3 480.16×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `listing_commission_percent` `5fa33512-efaf-48ad-b0ab-3a4795201bfb` p2 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **20** `contract_add_other_text` `61e40e26-4ef0-47be-bbbb-fef76fd325c2` p7 428×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **29** `txr_1909_delivery_days` `62d55214-3239-4115-ae97-66c7890b0128` p1 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `seller_email` `63354e73-5ead-42be-9240-720935deee7a` p1 200.58×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `TXR_2001_INVENTORY_CONDITION_DUE_DAYS` `68c0e227-5a35-42ac-92ee-224ed2084a6d` p7 46×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **20** `CONTRACT_PROPERTY_EXCLUSIONS` `6a7e2c2d-d327-4526-b531-74c0fd9513cd` p1 450.41×11.29: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.29pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `txr_1701_exclusions` `7278e7c0-587c-4244-8e44-29fa95d98257` p1 485.62×16.04: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16.04pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_offboard_fee_other_text` `72d9aff5-be65-422a-a280-5fed187a813f` p3 159×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_emergency_repair_phone` `76acb3a5-681d-4d25-a255-c9bc9cd52f62` p9 137×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `LISTING_EXCLUSIONS` `79679aaf-04e3-4939-9685-83ab69535d10` p1 272.4×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **9** `lead_paint_records_list` `799b11d9-2936-4fdb-9bf5-f0ec800267cc` p1 145×12: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **44** `txr_1420_purpose_other_description` `7b99945d-f13d-4a7e-8a73-6c51b9619270` p2 229.2×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_add_other_o_text` `7efe01d1-d997-4ac9-b600-854011c53a9f` p11 502×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **31** `txr_1954_oral_leases_description` `85a5e708-61fa-4e71-9031-b9ae02f109c0` p1 480.16×21.03: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 21.03pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_addendum_custom_2_text` `864f3f15-af1d-40ab-a1db-0157cfd4b775` p14 208×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **12** `hoa_addendum_seller_delivery_days` `86b03f89-2327-4504-af74-e39f83404f82` p1 69.6×14.4: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.4pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `contract_specific_repairs` `875c786c-c3ec-4a74-a79e-e4b38d0eadbe` p5 473.43×15.4: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 15.4pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `CONTRACT_SPECIAL_PROVISIONS` `894df093-c4ef-4667-bbb9-791fa277ddd7` p6 510×12.19: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.19pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `KNOWN_LIENS_EXCEPTION` `89884ff1-ace6-4669-a652-4697c761519a` p8 486.83×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `KNOWN_DISTRICTS` `89bbf5cc-7140-44e4-89da-d9972679799f` p8 488.37×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **29** `txr_1909_additional_earnest_money` `8af64fb8-e718-45e5-b9e0-5a3a62889cda` p1 53.89×14.75: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.75pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_repair_spend_limit` `8b0d597c-3f87-4fb7-a582-f918213fa4fc` p5 177.2×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **35** `txr_2004_bitten_explain` `8fbf7857-c704-49f1-8eee-7a853c562ecf` p2 480×20: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 20pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **24** `listing_condo_fee_includes_other_description` `9045d07f-5a73-4e8f-a81c-c3d098647f56` p1 370×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **29** `PROPERTY_FULL_ADDRESS` `93185ea7-076c-4601-baa1-681b5bd7b19a` p2 328.45×18.6: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 18.6pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **51** `txr_2216_other_components_description` `9549d02e-0c1f-450a-b807-7bad02e113bf` p1 219.5×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **32** `txr_1953_oral_leases_description` `958c8640-3f2d-41e4-96a9-d3297af2f429` p1 480.16×17.44: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 17.44pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `txr_1701_broker_comp_a_percent` `975239ff-348b-4a91-b4a3-80fca423740b` p11 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **25** `condo_resale_transfer_fee_description_3` `9c1e237d-dad9-4970-8e56-82ed7e8a1fd8` p2 138×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **30** `txr_1908_additional_earnest_money` `9cca3c75-5d14-4965-b768-3e2486168c7b` p1 60.94×13.47: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.47pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **13** `listing_amendment_paragraph_numbers` `a2f2c017-5bfe-4127-a13f-32e5cd511815` p1 91.09×14.11: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.11pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **20** `contract_add_district_notices_text` `a358f166-bb1f-4e30-9d04-994158645588` p7 263×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_known_financial_obligations_exception` `a3c402f1-e8fe-40c6-a729-372e0d44be1a` p7 140×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_add_other_p_text` `a4acf2a7-7ef2-490e-b6ea-84b6570c66e5` p11 502×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **16** `lease_listing_amend_paragraph_numbers` `a4f69a59-03e3-4510-95f1-726882c175d5` p1 91.83×12.31: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.31pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_property_legal_description` `a5af5bfc-13a7-42aa-9b85-0e9bf69db8f5` p1 504.23×17.96: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 17.96pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **29** `txr_1909_additional_option_fee` `a78f79c3-9ce7-4f6a-b9c8-b29129cd4081` p1 60.3×13.47: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.47pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **49** `txr_1503_protected_properties` `ab5d09a1-d4f0-4925-b86d-c82770d6c9e4` p1 485.9×64.6: Tall placement without clear narrative purpose — visual review before enabling multiline.
- **20** `CONTRACT_SPECIAL_PROVISIONS` `aee30999-0b10-438b-915f-88494b374958` p5 489.39×19.49: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 19.49pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_known_liens_exception` `afda4688-a248-4ce5-8494-6169776f1bbd` p7 460×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_maint_fee_other_text` `b3b74e86-a8c2-45b8-a523-3f9da6996165` p2 466×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **31** `txr_1954_fixture_other_description` `b4121ac3-4b55-4033-87da-0f2212bd0f78` p1 70×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **35** `txr_2004_propensity_explain` `b45f2fb6-fe24-4665-b293-86427d7dab95` p2 480×20: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 20pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_emergency_repair_phone` `b8e1f0ef-0a94-4669-8ce8-84291d628d78` p10 150×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **29** `PROPERTY_FULL_ADDRESS` `bc8ae565-818f-4841-9375-6bb79523db31` p1 510×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `seller_phone` `c02bec48-c1ed-453b-81a5-f9e56e4a3d67` p1 218.11×12.19: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.19pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **25** `condo_resale_transfer_fee_description_1` `c2bfc387-bce2-48eb-8c50-a34a26ce0cdc` p2 138×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **33** `txr_1505_paragraph_numbers` `c4513761-20dd-46da-86ff-c5c052092f1c` p1 73.77×11.55: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.55pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **31** `txr_1954_assume_other_lease_description` `c51713bc-0425-4878-9eae-83bd33e11649` p1 200×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **30** `txr_1908_waiver_days_after_notice` `c54302fe-b824-45b0-ae01-fdb5a77b96d4` p1 88.53×12.19: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12.19pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **11** `contract_specific_repairs` `c7896926-b224-445e-b4ec-e55973fa1c3f` p5 495.25×11.55: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.55pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `SCHEDULING_COMPANY` `c90356e8-3c19-4e33-b217-5157e2c18231` p5 300×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **18** `txr_2001_addendum_custom_4_text` `ca7cfee0-bb0b-4c42-bce8-c8ce2891f947` p14 212×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **15** `lease_inventory_condition_form_days` `cb4ae84b-524a-49e4-9b29-dfe04157f3b1` p10 60×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **44** `txr_1420_bonds_approved_other_description` `cbfacaa9-beeb-486a-afe8-4c80d44923f4` p1 339.8×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `listing_compensation_other` `cd690ad6-f37a-45fa-9205-3280edf2fb6c` p2 180×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **9** `lead_paint_known_present_explanation` `d12a7f30-58c1-4ed1-8c1c-7ea692c7e93f` p1 487.34×11.8: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 11.8pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `KNOWN_FINANCIAL_OBLIGATIONS_EXCEPTION` `d19f1150-8aeb-454a-980d-db6f1910835a` p8 484.26×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **28** `PROPERTY_FULL_ADDRESS` `d5059a85-ed68-4a1d-8350-722b6206ec27` p1 353×16: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 16pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `PROTECTION_PERIOD_DAYS` `d702bd3c-23b8-41bf-9ff0-bdf7a23623e1` p3 66.18×13.34: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.34pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **38** `OTHER_DOCUMENT_DESCRIPTION` `d8f47cc6-11ec-4f02-837e-9136ea54e168` p11 504.4×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `seller_name_2` `d98c9f25-4e9c-47f0-9b99-d67339e08d48` p1 484.98×13.47: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.47pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **47** `txr_2201_mgmt_fee_other_text` `db8c488f-f4bd-4c3c-a485-4a6db541e77b` p2 466×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **32** `PROPERTY_FULL_ADDRESS` `dd6f0b15-f183-4d68-9356-e2fad256793a` p1 331.91×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **30** `txr_1908_buyer_other_property_address` `dda3b0d5-f35a-41c2-847b-84240ed8f1b8` p1 480×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **50** `txr_1410_protected_parties` `e7de7bfa-558d-4136-93c2-c1196821ab35` p1 486×39.2: Tall placement without clear narrative purpose — visual review before enabling multiline.
- **7** `OTHER_DOCUMENT_DESCRIPTION` `eba52491-291c-4916-b0d2-646d29216d29` p9 503.25×14.36: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14.36pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `buyer_broker_comp_percent` `f1108775-88f7-4129-853e-146dd0501691` p2 45×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `seller_name_1` `f12374ff-4a8b-40c3-b80e-23737b6719ee` p1 485.8×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **25** `condo_resale_unpaid_assessment_description` `f2b8519d-ea7e-4ede-847a-b6ee56ecb8cc` p1 148×12: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **37** `property_legal_description` `f4693dfb-e4f5-476d-95c3-8746f2d2b8bf` p1 482.42×19.89: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 19.89pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `mls_delayed_days` `f612dc86-c68b-4205-9291-c39c9c2827ea` p4 60.53×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **9** `lead_paint_records_list` `f98689af-f053-489c-a3b9-429a088b9ebd` p1 505×12: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 12pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **7** `listing_flat_fee` `fb2a4217-5ea4-4c88-8773-f85ae177016c` p2 70×14: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 14pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **14** `contract_amend_other_modifications_text` `fc5dedba-84a4-46d2-a3f6-167ae8eb3707` p1 490×35: Tall placement without clear narrative purpose — visual review before enabling multiline.
- **7** `PAYMENT_COUNTY` `fe198bbb-b51d-47dd-90c7-81f0bd547bf0` p4 279.58×13.85: Narrative purpose but current height is ~1 line — dimension increase may be needed to cover the printed writing area. Dimension: Height 13.85pt ≈ 1 line(s). Expand only after confirming intended lined region on the PDF.
- **43** `txr_1950_terminate_other_text` `ff7b46ef-f5c4-42b3-b2ff-73b80dcbd934` p1 464.3×68.4: Tall placement without clear narrative purpose — visual review before enabling multiline.

## Confirmed problem: Itemization of Security Deposit — Damages (describe)

| Property | Value |
|----------|-------|
| Form ID | 51 |
| Form name | Itemization of Security Deposit |
| Form code / version | TXR-2216 / TXR-2216-01-05-2026 |
| Field ID | aaa1ad24-c64b-4b8a-b95b-49f3f9b890b0 |
| Field key | `txr_2216_damages_description` |
| Field label | TXR-2216 Damages Description |
| Mapping ID | `08446e94-1227-4645-83ba-646472836831` |
| Page | 1 |
| Coordinates | x=61.7, y=381.7 |
| Size | 370.4 × 63.2 |
| Font size | 9 |
| Current flags | is_multiline=false, mask_background=false |
| Recommended flags | is_multiline=true, mask_background=true |
| Confidence | HIGH CONFIDENCE |
| Geometry line hits | 0 |
| Line capacity | ~5 |
| Covers narrative area? | true |
| Dimension change recommended? | false — Current 370.4×63.2 (~5 lines) appears sized for the multi-line describe block; confirm it reaches the last printed line without entering the amount column. |
| Surrounding content risk | Primary risk: masking or widening into the damages amount column to the right, and/or the next deduction row below. Keep mask strictly inside the description placement. |
| Reason | Confirmed production problem field: “Damages to the Property, beyond wear and tear (describe)” — large underline-derived narrative block on TXR-2216; needs wrap + white mask over writing lines. Current flags both false. |
| Mapping notes | TXR-2216 initial Draft placement (underline/glyph-derived; awaiting Lee visual review) |
| PDF stream note | Form 51 page content is essentially non-vector (decoded ~742 bytes; 0 AcroForm fields; 0 path-line hits in box). Writing lines are not recoverable from content-stream geometry; recommendation relies on known lined describe block + underline-derived placement notes. |

## Code consistency (read-only)

- `components/packets/packet-form-field-overlay.tsx`: single-line uses non-wrap display; multiline uses `layoutTextInBox` + textarea; opaque white only when `mask_background===true`. **No defect.**
- `lib/fill-packet-form-pdf.ts`: PDF path honors `is_multiline` via shared layout; draws white rect when `maskBackground` even if empty. **No defect.**
- `lib/pdf-text-layout.ts`: shared wrap/font policy for preview and PDF. **No defect.**
- Zoom scales overlay font via `renderedHeight/originalHeight` and does not mutate stored coordinates. **No defect.**
- **Configuration gap (not a code bug):** most narrative mappings still have `is_multiline=false` / `mask_background=false`, so preview may CSS-wrap while PDF download draws a single overflowing line — same class of issue as Non-Real Estate Items before Map Fields flags were set.

## Proposed second-step plan (NOT EXECUTED)

1. Lee reviews HIGH CONFIDENCE rows in Map Fields against each source PDF.
2. Approve a batched production script that updates **only** approved mapping IDs’ `is_multiline` / `mask_background` (no coordinate changes unless separately approved).
3. Start with Itemization `txr_2216_damages_description` (`08446e94-1227-4645-83ba-646472836831`).
4. Re-fingerprint mappings; smoke Fill Form preview + Download PDF on a DRAFT packet.
5. Schedule MEDIUM / REVIEW REQUIRED visual pass before any further flag or dimension edits.

## Artifacts

- CSV: `audits/prod-multiline-mask-2026-08-06/multiline-mask-mapping-audit.csv`
- Records: `audits/prod-multiline-mask-2026-08-06/audit-records.json`
- Report: `audits/prod-multiline-mask-2026-08-06/REPORT.md`
