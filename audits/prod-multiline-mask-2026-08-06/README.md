# Production multiline / mask mapping audit + Lee apply (2026-08-06 → 2026-08-07)

Artifacts for `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`).

Lee’s edited workbook is the authoritative approval source. Flag updates were applied 2026-08-07.

| File | Purpose |
|------|---------|
| `REPORT.md` | Human-readable audit findings |
| `multiline-mask-mapping-audit.csv` | Full per-mapping recommendation table |
| `audit-records.json` | Full machine-readable audit records |
| `multiline-mask-manual-review.xlsx` | **Lee-edited approval workbook** (preserved; do not overwrite) |
| `multiline-mask-manual-review.csv` | Pre-Lee CSV backup of the original 164 review rows |
| `multiline-mask-manual-review-APPLIED.xlsx` | Permanent apply trail (Lee `1`s preserved; resolution/apply columns added) |
| `apply-result.json` / `apply-baseline-*.json` / `apply-mapping-*.json` | Production apply integrity + before/after |
| `apply-qa-report.json` / `apply-structural-validation.json` | Post-apply structural + sample PDF QA |
| `_apply-parsed-approvals.json` / `_apply-change-set.json` | Parsed approvals + resolved change set |
| `baseline-*.json` | Pre-apply audit integrity fingerprints |
| `form51-damages-geometry.json` | PDF stream probe for Itemization damages box |

**Apply summary (2026-08-07):** 80 approved rows → 80 resolved → 79 unique mappings updated (multiline+mask true); 0 geometry changes; FI fingerprint unchanged; mapping presentation fingerprint changed and explained by those 79 updates; 26 mappings mirrored to development by ID; 53 dev-sync exceptions.

Lee approval rule: `1` = approve positive flag change; blank = no change (not a reset). Dimension approval alone does not authorize geometry edits.

Scripts used (local only):

- `scripts/audit-prod-multiline-mask-readonly.ts`
- `scripts/audit-prod-multiline-mask-refine.ts`
- `scripts/build-multiline-mask-manual-review-workbook.ts`
- `scripts/_parse-lee-multiline-approvals.ts`
- `scripts/_resolve-lee-multiline-approvals.ts`
- `scripts/apply-lee-multiline-mask-approvals.ts`
- `scripts/qa-lee-multiline-mask-apply.ts`
- `scripts/write-lee-multiline-mask-applied-workbook.ts`
