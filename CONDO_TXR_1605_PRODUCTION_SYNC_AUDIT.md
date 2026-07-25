# CONDO TXR-1605 — Production Sync Audit

**Execution date/time:** 2026-07-25 (UTC apply completed ~02:55Z)  
**Source:** `harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx`  
**Target:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh`  
**Source Git commit (branch tip during apply):** `sync-condo-txr-1605-production` (see PR commit)  

---

## Summary

TXR-1605 / TREC 30-18 was configured first in **development** (form id **24**). Lee manually finalized Map Fields placement and Organization defaults there. The final development state was selectively synchronized onto the **existing** production form id **20** (`form_code=TXR-1605`, `version_label=TXR-1605-05-04-2026`). Development and production remain separate projects with isolated credentials. Numeric IDs were not assumed to match. Packet snapshots were not rewritten.

---

## Form identity

| | Development | Production |
|--|-------------|------------|
| Form ID | **24** | **20** (preserved; not recreated) |
| `form_code` | TXR-1605 | TXR-1605 |
| `version_label` | TXR-1605-05-04-2026 | TXR-1605-05-04-2026 |
| Name (after sync) | Residential Condominium Contract (Resale) | Residential Condominium Contract (Resale) |
| Name (before sync) | — | Condo Resale Contract |
| Scope / status | GLOBAL / ACTIVE | GLOBAL / ACTIVE |
| PDF path | `global/forms/24/CondoListing.pdf` | `global/forms/20/CondoListing.pdf` |

Exactly one ACTIVE GLOBAL production TXR-1605 form exists (id 20). A DELETED PRIVATE form 19 with the same code was ignored. No second Condo form was inserted. Forms 21/23 (TXR-1401 addendum lineage) were not present as ACTIVE production forms and were untouched.

---

## PDF / storage

| | Bytes | MD5 | SHA-256 |
|--|------:|-----|--------|
| Development | 194382 | `c6a7892e8373d65c96726b1e571662b8` | `039c29e3608ff93bdf35afc1e48e3ca871ac73d84d2d9ed9a71f4b08ede803a0` |
| Production (pre & post) | 194382 | `c6a7892e8373d65c96726b1e571662b8` | `039c29e3608ff93bdf35afc1e48e3ca871ac73d84d2d9ed9a71f4b08ede803a0` |

**Storage action:** `REUSE` — production already held the identical approved PDF; no upload.

---

## Operation counts (apply)

| Operation | Count |
|-----------|------:|
| Fields reused | 137 |
| Fields inserted | 13 |
| Fields metadata updated | 0 |
| Field conflicts | 0 |
| Mappings inserted | 158 |
| Mappings updated | 0 |
| Mappings unchanged | 0 |
| Final ACTIVE mapping count | **158** |
| Personal defaults inserted/updated | 0 / 0 |
| Organization defaults inserted | **4** |
| Organization defaults updated/unchanged | 0 / 0 |
| Storage | REUSE |
| Packet instance changes | **0** |
| Form row | Updated `form_name` only |

### Inserted Global fields (`contract_condo_*`)

All 13 development condo fields were missing in production and inserted with new production UUIDs (development IDs not copied). Keys:

- `contract_condo_unit_number`
- `contract_condo_building`
- `contract_condo_project_name`
- `contract_condo_parking_assigned`
- `contract_condo_documents_received`
- `contract_condo_documents_not_received`
- `contract_condo_documents_delivery_days`
- `contract_condo_certificate_received`
- `contract_condo_certificate_not_received`
- `contract_condo_certificate_delivery_days`
- `contract_condo_certificate_affidavit_waiver`
- `contract_condo_right_of_refusal_certification_days`
- `contract_condo_association_transfer_charges_cap`

### Organization defaults synchronized (Davey Goosmann Realty, form-scoped)

All value `"NA"`:

- `contract_specific_repairs`
- `contract_title_objection_use_activity`
- `CONTRACT_BROKER_DISCLOSURE_TEXT`
- `CONTRACT_SPECIAL_PROVISIONS`

No Lee Personal form-scoped defaults existed on development form 24.

---

## Deviations from earlier inventory docs

Live development (verified before sync), not the original 161-row proposal:

- **158** ACTIVE mappings (43 repositioned vs original approximate manifest; 115 unchanged)
- **150** distinct field keys (137 reused + 13 new)
- Widgets: 109 text / 47 checkbox / 2 date
- Production form name updated to match development official title

---

## Commands (secrets omitted)

```text
npm run test:condo-txr-1605-prod-sync
npm run sync:condo-txr-1605-prod -- --dry-run
npm run sync:condo-txr-1605-prod -- --apply --confirm EXISTING_PROD_TXR_1605
npm run sync:condo-txr-1605-prod -- --dry-run   # post-apply idempotency
```

### Dry-run (pre-apply)

- Resolved production form **20**
- Planned: 13 field INSERT, 137 REUSE, 158 mapping INSERT, 4 org default INSERT, storage REUSE, form_name UPDATE
- Blockers: none
- Packet changes: 0

### Apply

- `APPLY_COMPLETE`
- insertedFields 13 / insertedMappings 158 / insertedDefaults 4
- `PACKET_FP_UNCHANGED=true`
- `POST_IDEMPOTENCY_PENDING_OPS=0`

### Post-apply dry-run (idempotency)

- fields: 150 REUSE
- mappings: 158 NO_CHANGE
- org defaults: 4 NO_CHANGE
- storage REUSE; form_name NO_CHANGE
- blockers: none

---

## Packet field-instance fingerprint

| | Count | SHA-256 |
|--|------:|---------|
| Pre | 172 | `0bb8736beec0159306ebdfebd60bde97bf6b897fe28e68848566f3ceff4b6ecd` |
| Post | 172 | `0bb8736beec0159306ebdfebd60bde97bf6b897fe28e68848566f3ceff4b6ecd` |

**Unchanged.** Packets=2, packet_forms=12 unchanged. Mappings outside target remained 1205; defaults outside target remained 161 (plus the 4 new form-scoped org defaults only on form 20).

---

## Safety confirmations

- Existing production form id **20** preserved (not recreated)
- No duplicate ACTIVE TXR-1605 form
- No Global preference literals introduced
- No packet / packet_form / field_instance mutations
- Unrelated forms/mappings/defaults/storage untouched (outside the 13 new Global fields + form 20 mappings/defaults + form_name)
- Rollback artifact: `CONDO_TXR_1605_PRODUCTION_ROLLBACK.json` + `npm run rollback:condo-txr-1605-prod` (not executed)

---

## Artifacts

- `CONDO_TXR_1605_PRODUCTION_SYNC_MANIFEST.json` — current idle/idempotent plan from live state
- `CONDO_TXR_1605_PRODUCTION_APPLY_SUMMARY.json` — apply-time operation summary
- `CONDO_TXR_1605_PRODUCTION_PRE_SYNC.json`
- `CONDO_TXR_1605_PRODUCTION_POST_SYNC.json`
- `CONDO_TXR_1605_PRODUCTION_ROLLBACK.json`
- `scripts/sync-condo-txr-1605-to-production.ts`
- `scripts/rollback-condo-txr-1605-production.ts`
- `lib/condo-txr-1605-production-sync.ts` (+ tests)
