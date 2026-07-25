# CONDO TXR-1605 — Development Implementation Audit

**Date:** 2026-07-24  
**Environment:** `harbaugh-forms-dev` only (`ewxsxwzezhkeawnjvigx`)  
**Production:** not accessed, not modified  

---

## Form

| Item | Value |
|------|-------|
| Development form ID | **24** |
| Stable identity | `form_code=TXR-1605`, `version_label=TXR-1605-05-04-2026` |
| Name | Residential Condominium Contract (Resale) |
| Category / state | `CONTRACT` / `TX` |
| Scope / status | `GLOBAL` / `ACTIVE` |
| Storage path | `global/forms/24/CondoListing.pdf` |
| Source PDF (repo) | `assets/forms/CondoListing.pdf` |
| Bytes | 194382 |
| MD5 | `c6a7892e8373d65c96726b1e571662b8` |
| SHA-256 | `039c29e3608ff93bdf35afc1e48e3ca871ac73d84d2d9ed9a71f4b08ede803a0` |
| Pages / AcroForms | 10 / 0 |

Remote storage object checksum and size match the local supplied PDF.

---

## Counts

| Metric | Inventory (original) | Implemented |
|--------|---------------------:|------------:|
| ACTIVE mappings | 161 | **158** |
| New Global fields | 13 | **13** |
| Mapping rows reusing existing Globals | 148 | **145** |
| Unique reused Global field keys | (not stated) | **137** |
| Text widgets | 113 | **109** |
| Checkbox widgets | 47 | **47** |
| Date widgets | 1 | **2** |
| Ordinary automatic sources | 28 | **27** |
| Custom resolvers | 4 | **4** |
| manual_only | 129 | **126** (+ 1 catalog `source_type` NULL counted separately) |

### Mappings by page

| Page | Count |
|------|------:|
| 1 | 18 |
| 2 | 19 |
| 3 | 3 |
| 4 | 9 |
| 5 | 13 |
| 6 | 6 |
| 7 | 39 |
| 8 | 8 |
| 9 | 42 |
| 10 | 1 |
| **Total** | **158** |

---

## Newly created Global fields

| field_key | id |
|-----------|----|
| `contract_condo_unit_number` | `5e98fbb2-7684-411c-9924-cba6607afbc7` |
| `contract_condo_building` | `74bcaabc-4a41-4dbb-bfd3-435f00309caf` |
| `contract_condo_project_name` | `3afddd42-cf9e-4406-b17d-d4d1289a8eac` |
| `contract_condo_parking_assigned` | `21e2c999-9654-4238-b39e-b7e099c7dd70` |
| `contract_condo_documents_received` | `071be787-484a-4353-96d9-89a4b411b475` |
| `contract_condo_documents_not_received` | `1f02d388-4675-4e2d-abfc-95bfdd892b14` |
| `contract_condo_documents_delivery_days` | `0cc66edc-02d4-4343-9e63-18e506e11eb4` |
| `contract_condo_certificate_received` | `e7e9efcb-b6c0-42a4-9043-00b426d5fc75` |
| `contract_condo_certificate_not_received` | `2409da55-993f-4587-9c1c-8e415e757f4f` |
| `contract_condo_certificate_delivery_days` | `ca7cc91e-be02-4cbc-ae4d-336f783b3b4f` |
| `contract_condo_certificate_affidavit_waiver` | `ab20e562-c33d-4b33-8118-0ced8d171b3f` |
| `contract_condo_right_of_refusal_certification_days` | `3c5abf43-9325-4eec-9f73-bc5d052de15e` |
| `contract_condo_association_transfer_charges_cap` | `14e02ff2-9ce9-43be-821a-2ba196681bd0` |

`contract_condo_unit_number` → `packet_property` / `unit`. All other new fields → `manual_only` with null path/resolver.

Full reused field-key list: every non-new `field_key` in `data/condo-txr-1605/manifest.json` mappings (145 mapping rows → 137 unique keys, because `property_concerning_full_address` is placed on pages 2–10).

---

## Deviations from original 161-row inventory

Approved Lee resolutions + implementation notes:

1. **County blank** before preprinted “Texas” mapped as `property_county` only — **not** `PROPERTY_STATE`, **not** `property_legal_description` (legal_description inventory row removed).
2. **Effective Date** uses single existing `contract_effective_date` (date widget mapping) — **not** day/month/year parts.
3. Building / project remain **manual_only**; no Property columns / no new tables.
4. “Located at (address/zip)” reuses `PROPERTY_ADDRESS_ZIP` → `packet_property.address_city_state_zip`.
5. Net mapping count **158** (161 − legal_description − effective day/month/year + effective_date).
6. Date widget count **2** (`contract_closing_date` + `contract_effective_date`).
7. `seller_city_state_zip` mapped on seller notice continuation (intentional small improvement vs Form 11).
8. `CONTRACT_SPECIAL_PROVISIONS` still has catalog `source_type` NULL (counted as unset; recommend later normalize to `manual_only` — not changed here to avoid cross-form catalog mutation).

---

## Excluded signing / receipt fields

~72 initials, party signatures, attorney fax, and page-10 receipt/execution blanks omitted. Authentisign remains responsible for signing. Page 10 has only the Contract Concerning header mapping.

---

## Safety confirmations

| Check | Result |
|-------|--------|
| Defaults created/changed | **0** on new fields |
| Packet field instances for new fields | **0** |
| Forms 11 / 21 / 23 | Untouched (read-only verify) |
| Production project | **Not accessed** |
| Target host | `ewxsxwzezhkeawnjvigx.supabase.co` |

---

## Validation commands

```text
npm run test:condo-txr-1605-manifest   # 6 pass
npm run apply:condo-txr-1605 -- --dry-run
npm run apply:condo-txr-1605 -- --execute
npx tsc --noEmit
npx eslint scripts/apply-condo-txr-1605.ts lib/condo-txr-1605-manifest.test.ts --max-warnings 0
npm run build
```

Post-apply DB validation report: `_audit_tmp/condo_txr_1605_validate.json` (local only).

---

## Next for Lee

1. Open development Forms → **Residential Condominium Contract (Resale)** → **Map Fields**.
2. Manually reposition/resize approximate placements.
3. Assign Personal / Organization defaults in Map Fields (none were seeded).
4. Production sync is **out of scope** for this branch — later operation must match production form by stable identity (`TXR-1605` / version), not numeric ID 24.
