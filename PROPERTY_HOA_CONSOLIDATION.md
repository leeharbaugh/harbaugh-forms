# Property HOA storage consolidation

**Date:** 2026-07-22  
**Database:** `harbaugh-forms-dev` only (no production environment)  
**Migration:** `supabase/migrations/20260722120000_consolidate_property_hoa_storage.sql`

## Decision summary

- `property_hoas` is the authoritative HOA data model.
- The Property screen intentionally exposes one HOA record, while the schema preserves multiple-HOA capability for future use.
- The first ACTIVE HOA row (`ORDER BY create_date, id`) is the temporary single-record UI convention.
- Direct HOA columns on `properties` were retired as redundant.
- Existing development HOA values were approved as disposable test data and were not migrated.
- Clearing HOA Name soft-deletes the displayed HOA row (`status = 'DELETED'`); no hard delete.

Multi-HOA UI is **not** implemented.

## Retired `properties` columns

| Column | Former usage | Destination |
|---|---|---|
| `hoa_name` | Property form + `packet_property` source_path | `property_hoas.hoa_name` |
| `hoa_phone` | Property form | `property_hoas.hoa_phone` |
| `hoa_management_company` | Property form “Management company” | `property_hoas.management_company_name` |

## Retained on `properties`

`has_hoa`, `hoa_contact_name`, `hoa_email`, `hoa_website`, `hoa_dues_amount`, `hoa_dues_frequency`

## Redirected catalog fields

| Field | Before | After |
|---|---|---|
| `HOA_ASSOCIATION_NAME` | `packet_property` / `hoa_name` | `custom_resolver` / `property_hoa_name` |
| `txr_2001_hoa_name` | `packet_property` / `hoa_name` | `custom_resolver` / `property_hoa_name` |

Already authoritative: `property_hoa_name`, `property_hoa_phone`.

## Deferred

- Multi-HOA Property UI
- Explicit primary-HOA designation (`is_primary`)
- Remaining legacy architecture cleanup (`contract_details`, listing-agreement table/route)
- Production-environment rollout
