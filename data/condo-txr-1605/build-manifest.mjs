/**
 * Regenerates data/condo-txr-1605/manifest.json.
 *
 * Read-only with respect to any database: it derives everything from
 * assets/forms/CondoListing.pdf geometry (already extracted into the coordinate
 * tables below) plus the audit artifacts in _audit_tmp/.
 *
 * Usage: node data/condo-txr-1605/build-manifest.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel));
const readJson = (rel) => JSON.parse(read(rel).toString("utf8"));

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/**
 * The condo PDF reports geometry in PDF user space (origin bottom-left).
 * Mappings are stored top-left, matching Form 11 (TXR-1601).
 */
const TEXT_HEIGHT = 14;
const CHECKBOX_SIZE = 12;

/** Text box sitting on a drawn fill-in rule whose PDF y is `ruleY`. */
const onRule = (ruleY, height = TEXT_HEIGHT) =>
  round(PAGE_HEIGHT - ruleY - height + 1.6);
/** Text box sitting on an underscore run whose text baseline is `baselineY`. */
const onUnderscores = (baselineY, height = TEXT_HEIGHT) =>
  round(PAGE_HEIGHT - baselineY - height + 3.6);
/** Checkbox glyph drawn at text baseline `baselineY`. */
const onGlyph = (baselineY) => round(PAGE_HEIGHT - baselineY - 10);

function round(n) {
  return Math.round(n * 100) / 100;
}

/** Header rule is identical on every page: y=748, x=120.1..415.6. */
const header = (page) => ({
  page,
  key: "property_concerning_full_address",
  name: `Property concerning header (page ${page})`,
  x: 120.1,
  y: onRule(748),
  w: 295.4,
  h: TEXT_HEIGHT,
  note: "Per-page header mapping, pages 2-10, matching Form 11 pages 2-12.",
});

const text = (page, key, name, x, y, w, note, h = TEXT_HEIGHT) => ({
  page,
  key,
  name,
  x,
  y,
  w,
  h,
  note,
});

const check = (page, key, name, x, baselineY, note) => ({
  page,
  key,
  name,
  x,
  y: onGlyph(baselineY),
  w: CHECKBOX_SIZE,
  h: CHECKBOX_SIZE,
  widget: "checkbox",
  note,
});

const ONE_LINE = "Multi-line blank; mapped on the first line only, per Form 11 practice.";

// ---------------------------------------------------------------------------
// Placements, page by page. Coordinates are derived from CondoListing.pdf.
// ---------------------------------------------------------------------------

const placements = [
  // ---- Page 1 -------------------------------------------------------------
  text(1, "CONTRACT_SELLER_NAMES", "Page 1 seller names", 286.2, onRule(706.2), 225.7, "P1 rule y=706.2 between \"parties to this contract are\" and \"(Seller)\"."),
  text(1, "contract_buyer_names", "Page 1 buyer names", 88.8, onRule(697), 348.1, "P1 rule y=697 between \"and\" and \"(Buyer)\"."),
  text(1, "contract_condo_unit_number", "Page 1 condominium unit number", 257.8, onRule(648.2), 72, "P2A(1) \"Unit ____,\" rule y=648.2."),
  text(1, "contract_condo_building", "Page 1 condominium building", 409.6, onRule(648.2), 143.9, "P2A(1) \"in Building ____,\" rule y=648.2."),
  text(1, "contract_condo_project_name", "Page 1 condominium project name", 115.9, onRule(639), 260.8, "P2A(1) \"of ____, a condominium project\" rule y=639."),
  text(1, "PROPERTY_ADDRESS_ZIP", "Page 1 property address and zip", 102.7, onRule(629.6), 448, "P2A(1) \"located at\" first full-width rule y=629.6; the y=620.5 continuation rule is intentionally left unmapped, as in Form 11."),
  text(1, "PROPERTY_CITY", "Page 1 property city", 240, onRule(611.4), 158.2, "P2A(1) \"City of ____,\" rule y=611.4."),
  text(1, "property_county", "Page 1 property county", 454, onRule(611.4), 96.2, "P2A(1) \"County of ____,\" rule y=611.4. The continuation rule at y=602.4 immediately before the preprinted word \"Texas\" is deliberately NOT mapped."),
  text(1, "contract_condo_parking_assigned", "Page 1 assigned parking areas", 259.1, onRule(547.8), 291.1, `P2A(1) "Parking areas assigned to the Unit are:" rule y=547.8. ${ONE_LINE}`),
  text(1, "CONTRACT_PROPERTY_EXCLUSIONS", "Page 1 property exclusions", 350.6, onRule(374.9), 206.5, `P2A(4) exclusions rule y=374.9. ${ONE_LINE}`),
  check(1, "contract_condo_documents_received", "Page 1 documents received", 66.6, 337.1, "P2B(1). Check one box only with P2B(2)."),
  check(1, "contract_condo_documents_not_received", "Page 1 documents not received", 66.1, 315.7, "P2B(2). Check one box only with P2B(1)."),
  text(1, "contract_condo_documents_delivery_days", "Page 1 documents delivery days", 262.3, onRule(304.4), 42.8, "P2B(2) delivery-days rule y=304.4."),
  check(1, "contract_condo_certificate_received", "Page 1 resale certificate received", 66.7, 203.8, "P2C(1). Check one box only across P2C(1)/(2)/(3)."),
  check(1, "contract_condo_certificate_not_received", "Page 1 resale certificate not received", 66.4, 192.3, "P2C(2). Check one box only across P2C(1)/(2)/(3)."),
  text(1, "contract_condo_certificate_delivery_days", "Page 1 resale certificate delivery days", 102.7, onRule(181.9), 43.4, "P2C(2) delivery-days rule y=181.9."),
  check(1, "contract_condo_certificate_affidavit_waiver", "Page 1 resale certificate affidavit waiver", 67.2, 137.5, "P2C(3). Check one box only across P2C(1)/(2)/(3)."),
  text(1, "contract_condo_right_of_refusal_certification_days", "Page 1 right of refusal certification days", 84.7, onUnderscores(45.7), 34, "P2D. Blank is an underscore run at baseline y=45.7, not a drawn rule."),

  // ---- Page 2 -------------------------------------------------------------
  header(2),
  text(2, "contract_sales_price_cash", "Page 2 cash portion of sales price", 438.4, onRule(716.8), 119.6, "P3A rule y=716.8."),
  check(2, "contract_financing_third_party", "Page 2 third party financing addendum", 320.1, 686.4, "P3B. Check all that apply."),
  check(2, "contract_financing_loan_assumption", "Page 2 loan assumption addendum", 81, 674.4, "P3B. Check all that apply."),
  check(2, "contract_financing_seller_financing", "Page 2 seller financing addendum", 255.3, 674.4, "P3B. Check all that apply."),
  text(2, "contract_sales_price_financing", "Page 2 sum of all financing", 438.4, onRule(673), 119.6, "P3B rule y=673."),
  text(2, "contract_sales_price_total", "Page 2 total sales price", 438.4, onRule(661.7), 119.6, "P3C rule y=661.7."),
  check(2, "contract_lease_residential", "Page 2 residential leases", 54, 612.1, "P4A. Check all applicable boxes."),
  check(2, "contract_lease_fixture", "Page 2 fixture leases", 54, 592.4, "P4B. Check all applicable boxes."),
  text(2, "contract_escrow_agent_name", "Page 2 escrow agent name", 193.4, onRule(539.5), 205.6, "P5A rule y=539.5."),
  text(2, "contract_escrow_agent_address", "Page 2 escrow agent address", 81, onRule(528.8), 256.6, "P5A address wraps across the end of y=539.5 and the wider y=528.8 segment; mapped on the wider segment, as in Form 11."),
  text(2, "contract_earnest_money_amount", "Page 2 earnest money amount", 407, onUnderscores(530.2), 85, "P5A \"$______ as earnest money\" underscore run at baseline y=530.2."),
  text(2, "contract_option_fee_amount", "Page 2 option fee amount", 150, onUnderscores(519.6), 85, "P5A \"$______ as the option fee\" underscore run at baseline y=519.6."),
  text(2, "contract_additional_earnest_money_amount", "Page 2 additional earnest money amount", 368, onUnderscores(499.3), 95, "P5A(1) underscore run at baseline y=499.3."),
  text(2, "contract_additional_earnest_money_days", "Page 2 additional earnest money days", 134, onUnderscores(490.3), 32, "P5A(1) underscore run at baseline y=490.3."),
  text(2, "contract_option_period_days", "Page 2 option period days", 81, onUnderscores(345.6), 38, "P5B underscore run at baseline y=345.6."),
  check(2, "contract_title_policy_paid_by_seller", "Page 2 title policy at seller expense", 314.4, 208, "P6A. Check one box only with the buyer's-expense box."),
  check(2, "contract_title_policy_paid_by_buyer", "Page 2 title policy at buyer expense", 371.8, 208, "P6A. Check one box only with the seller's-expense box."),
  text(2, "contract_title_company_name", "Page 2 title company name", 273, onRule(197.4), 198, "P6A rule y=197.4."),

  // ---- Page 3 -------------------------------------------------------------
  header(3),
  text(3, "contract_title_objection_use_activity", "Page 3 title objection use or activity", 208.4, onRule(611.6), 344.8, `P6C rule y=611.6. ${ONE_LINE}`),
  text(3, "contract_title_objection_days", "Page 3 title objection days", 394, onUnderscores(593.7), 32, "P6C underscore run at baseline y=593.7, not a drawn rule."),

  // ---- Page 4 -------------------------------------------------------------
  header(4),
  check(4, "contract_seller_disclosure_received", "Page 4 seller disclosure received", 59.9, 561.7, "P7B(1). Check one box only across P7B(1)/(2)/(3)."),
  check(4, "contract_seller_disclosure_not_received", "Page 4 seller disclosure not received", 59.9, 552.2, "P7B(2). Check one box only across P7B(1)/(2)/(3)."),
  text(4, "contract_seller_disclosure_delivery_days", "Page 4 seller disclosure delivery days", 401.6, onRule(550.8), 35.8, "P7B(2) rule y=550.8."),
  check(4, "contract_seller_disclosure_not_required", "Page 4 seller disclosure not required", 58.7, 485.7, "P7B(3). Check one box only across P7B(1)/(2)/(3)."),
  check(4, "CONTRACT_PROPERTY_AS_IS", "Page 4 property accepted as is", 58.9, 382, "P7D(1). Check one box only with P7D(2)."),
  check(4, "contract_property_as_is_with_repairs", "Page 4 property as is with repairs", 58.9, 372.3, "P7D(2). Check one box only with P7D(1)."),
  text(4, "contract_specific_repairs", "Page 4 specific repairs and treatments", 300.4, onRule(361.1), 250.8, `P7D(2) rule y=361.1. ${ONE_LINE}`),
  text(4, "CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT", "Page 4 service contract reimbursement amount", 424.3, onRule(92.6), 96.7, "P7H rule y=92.6."),

  // ---- Page 5 -------------------------------------------------------------
  header(5),
  text(5, "CONTRACT_BROKER_DISCLOSURE_TEXT", "Page 5 broker disclosure text", 126, onUnderscores(700.1), 420, "P8 \"Disclose if applicable:\" underscore run at baseline y=700.1."),
  {
    page: 5,
    key: "contract_closing_date",
    name: "Page 5 closing date",
    x: 294.6,
    y: onRule(678.4),
    w: 136.7,
    h: TEXT_HEIGHT,
    widget: "date",
    note: "P9A rule y=678.4. The short trailing \"20 ___\" rule (x=451.4-474.2) is left unmapped, as in Form 11.",
  },
  check(5, "CONTRACT_BUYER_POSSESSION_AT_CLOSING", "Page 5 possession upon closing and funding", 335.9, 507.8, "P10A. Mutually exclusive with the temporary-lease option."),
  check(5, "contract_buyer_possession_by_lease", "Page 5 possession by temporary lease", 478.2, 507.8, "P10A. Mutually exclusive with the at-closing option."),
  text(5, "CONTRACT_SPECIAL_PROVISIONS", "Page 5 special provisions", 347.6, onRule(344), 210.7, `P11 three-line blank (rules y=344, 335, 326). ${ONE_LINE}`),
  text(5, "CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT", "Page 5 seller expense contribution amount", 251, onRule(260.3), 84.5, "P12A(1)(b) rule y=260.3."),
  text(5, "contract_condo_association_transfer_charges_cap", "Page 5 association transfer charges cap", 340.2, onRule(146.8), 94.7, "P12A(3) rule y=146.8. Condo-only paragraph with no 1-4 analogue."),
  check(5, "contract_seller_contributes_to_buyer_broker_comp", "Page 5 seller contributes to buyer broker compensation", 60.6, 52.6, "P12B(1). Enables the nested dollar/percent election."),
  check(5, "contract_seller_contribution_dollar_selected", "Page 5 seller contribution dollar option", 285, 52.6, "P12B(1). Check one box only with the percent option."),
  text(5, "contract_seller_contribution_amount", "Page 5 seller contribution amount", 311, onUnderscores(52.6), 68, "P12B(1) \"$_________\" underscore run at baseline y=52.6."),
  check(5, "contract_seller_contribution_percent_selected", "Page 5 seller contribution percent option", 389.5, 52.6, "P12B(1). Check one box only with the dollar option."),
  text(5, "contract_seller_contribution_percent", "Page 5 seller contribution percent", 407.8, onUnderscores(52.6), 42, "P12B(1) \"______%\" underscore run at baseline y=52.6."),

  // ---- Page 6 -------------------------------------------------------------
  header(6),
  check(6, "contract_buyer_contributes_to_seller_broker_comp", "Page 6 buyer contributes to seller broker compensation", 61.5, 730.7, "P12B(2). Enables the nested dollar/percent election."),
  check(6, "contract_buyer_contribution_dollar_selected", "Page 6 buyer contribution dollar option", 285.6, 730.7, "P12B(2). Check one box only with the percent option."),
  text(6, "contract_buyer_contribution_amount", "Page 6 buyer contribution amount", 311, onUnderscores(730.7), 68, "P12B(2) \"$_________\" underscore run at baseline y=730.7."),
  check(6, "contract_buyer_contribution_percent_selected", "Page 6 buyer contribution percent option", 389.8, 730.7, "P12B(2). Check one box only with the dollar option."),
  text(6, "contract_buyer_contribution_percent", "Page 6 buyer contribution percent", 407.7, onUnderscores(730.7), 42, "P12B(2) \"______%\" underscore run at baseline y=730.7."),

  // ---- Page 7 -------------------------------------------------------------
  header(7),
  text(7, "CONTRACT_BUYER_NOTICE_ADDRESS", "Page 7 buyer notice address", 106.7, onRule(598.3), 185, "P21 rule y=598.3."),
  text(7, "BUYER_1_CITY_STATE_ZIP", "Page 7 buyer notice city state zip", 62.2, onRule(584.4), 229.6, "P21 buyer address continuation rule y=584.4."),
  text(7, "contract_buyer_notice_phone", "Page 7 buyer notice phone", 117.6, onUnderscores(571.8), 172, "P21 buyer phone is an underscore run at baseline y=571.8; the seller side is a drawn rule."),
  text(7, "contract_buyer_notice_email", "Page 7 buyer notice email", 111.7, onRule(542.4), 180, "P21 rule y=542.4."),
  text(7, "CONTRACT_SELLER_NOTICE_ADDRESS", "Page 7 seller notice address", 372.2, onRule(598.3), 171.5, "P21 rule y=598.3."),
  text(7, "seller_city_state_zip", "Page 7 seller notice city state zip", 327.7, onRule(584.4), 216, "P21 seller address continuation rule y=584.4. Divergence from Form 11, which leaves this rule unmapped."),
  text(7, "CONTRACT_SELLER_NOTICE_PHONE", "Page 7 seller notice phone", 377.3, onRule(570.4), 166.4, "P21 rule y=570.4."),
  text(7, "CONTRACT_SELLER_NOTICE_EMAIL", "Page 7 seller notice email", 374.2, onRule(542.4), 169.6, "P21 rule y=542.4."),
  text(7, "contract_buyer_agent_notice_address", "Page 7 buyer agent notice address", 106.7, onRule(505.3), 185, "P21 rule y=505.3; the y=491.4 continuation rule is left unmapped, as in Form 11."),
  text(7, "CONTRACT_BUYER_AGENT_NOTICE_PHONE", "Page 7 buyer agent notice phone", 97.4, onRule(477.4), 194.3, "P21 rule y=477.4."),
  text(7, "CONTRACT_BUYER_AGENT_NOTICE_EMAIL", "Page 7 buyer agent notice email", 97.8, onRule(463.3), 193.9, "P21 rule y=463.3."),
  text(7, "CONTRACT_SELLER_AGENT_NOTICE_ADDRESS", "Page 7 seller agent notice address", 372.2, onRule(505.3), 171.5, "P21 rule y=505.3; the y=491.4 continuation rule is left unmapped, as in Form 11."),
  text(7, "CONTRACT_SELLER_AGENT_NOTICE_PHONE", "Page 7 seller agent notice phone", 363, onRule(477.4), 180.7, "P21 rule y=477.4."),
  text(7, "CONTRACT_SELLER_AGENT_NOTICE_EMAIL", "Page 7 seller agent notice email", 363.4, onRule(463.3), 180.4, "P21 rule y=463.3."),
  ...[
    ["contract_add_third_party_financing", "third party financing addendum", 409.3, 61.9],
    ["contract_add_sale_of_other_property", "sale of other property addendum", 397, 61.9],
    ["contract_add_appraisal_termination", "appraisal termination addendum", 384.7, 61.9],
    ["contract_add_seller_financing", "seller financing addendum", 372.4, 61.9],
    ["contract_add_1031_exchange", "1031 exchange addendum", 360.2, 61.9],
    ["contract_add_short_sale", "short sale addendum", 347.9, 61.9],
    ["contract_add_loan_assumption", "loan assumption addendum", 335.7, 61.9],
    ["contract_add_release_liability_va", "release of liability on VA loan addendum", 323.3, 61.9],
    ["contract_add_residential_leases", "residential leases addendum", 291.5, 62.2],
    ["contract_add_fixture_leases", "fixture leases addendum", 279.9, 62.2],
    ["contract_add_buyer_temp_lease", "buyer temporary lease addendum", 268.4, 62.2],
    ["contract_add_seller_temp_lease", "seller temporary lease addendum", 256.8, 62.2],
    ["contract_add_hydrostatic_testing", "hydrostatic testing addendum", 232.2, 61.9],
    ["contract_add_environmental", "environmental assessment addendum", 220, 61.9],
    ["contract_add_lead_paint", "lead-based paint addendum", 194.3, 61.9],
    ["contract_add_propane_service_area", "propane service area addendum", 174.1, 61.9],
    ["contract_add_seaward_gulf", "seaward gulf addendum", 162.6, 61.9],
    ["contract_add_coastal_area", "coastal area addendum", 151.1, 61.9],
    ["contract_add_district_notices", "district notices addendum", 139.5, 61.9],
    ["contract_add_non_realty_items", "non-realty items addendum", 73, 62.2],
    ["contract_add_backup_contract", "back-up contract addendum", 60.7, 62.2],
    ["contract_add_other", "other addendum", 48.5, 61.9],
  ].map(([key, label, baselineY, x]) =>
    check(7, key, `Page 7 ${label}`, x, baselineY, "P22. Check all applicable boxes."),
  ),
  text(7, "contract_add_district_notices_text", "Page 7 district notices text", 285, onUnderscores(130.5), 263, `P22 underscore run at baseline y=130.5. ${ONE_LINE}`),
  text(7, "contract_add_other_text", "Page 7 other addendum text", 122.4, onUnderscores(48.5), 428, `P22 underscore run at baseline y=48.5. ${ONE_LINE}`),

  // ---- Page 8 -------------------------------------------------------------
  header(8),
  text(8, "contract_buyer_attorney_name", "Page 8 buyer attorney name", 128.1, onRule(672.6), 165, "P23 rule y=672.6; the y=654.3 continuation rule is left unmapped, as in Form 11."),
  text(8, "contract_buyer_attorney_phone", "Page 8 buyer attorney phone", 160, onRule(635), 133, "P23 rule y=635, starting after the preprinted \"( )\" area-code marker."),
  text(8, "contract_buyer_attorney_email", "Page 8 buyer attorney email", 128.1, onRule(593.8), 165, "P23 rule y=593.8. The y=612.8 Fax rules are excluded, as in Form 11."),
  text(8, "contract_seller_attorney_name", "Page 8 seller attorney name", 388, onRule(672.6), 162.5, "P23 rule y=672.6; the y=654.3 continuation rule is left unmapped, as in Form 11."),
  text(8, "contract_seller_attorney_phone", "Page 8 seller attorney phone", 420, onRule(635), 130.5, "P23 rule y=635, starting after the preprinted \"( )\" area-code marker."),
  text(8, "contract_seller_attorney_email", "Page 8 seller attorney email", 388, onRule(593.8), 162.5, "P23 rule y=593.8. The y=612.8 Fax rules are excluded, as in Form 11."),
  {
    page: 8,
    key: "contract_effective_date",
    name: "Page 8 contract effective date",
    x: 214.3,
    y: onRule(494.2),
    w: 195,
    h: TEXT_HEIGHT,
    widget: "date",
    note: "EXECUTED date line, mapped on the month rule (y=494.2, x=214.3-409.3) because it is the only blank on that line wide enough for a full date and it avoids overprinting the preprinted \"day of\" text. The short day rule (x=134.3-175.6) and the trailing \"20 ___\" year rule (x=430.9-464.6) are left unmapped. Not a signature line.",
  },

  // ---- Page 9 (broker contact information) --------------------------------
  header(9),
  ...[
    // [ruleY, x, width, field_key, label]
    [645, 50.8, 235.1, "CONTRACT_SELLER_BROKERAGE_NAME", "seller brokerage name"],
    [630.6, 104.3, 365, "CONTRACT_SELLER_BROKERAGE_ADDRESS", "seller brokerage address"],
    [616.1, 176.8, 130, "CONTRACT_SELLER_BROKERAGE_LICENSE_NUMBER", "seller brokerage license number"],
    [601.7, 147.2, 240, "CONTRACT_SELLER_ASSOCIATE_NAME", "seller associate name"],
    [587.2, 122.8, 240, "contract_seller_team_name", "seller team name"],
    [572.8, 145.8, 240, "CONTRACT_SELLER_ASSOCIATE_EMAIL", "seller associate email"],
    [558.4, 167.3, 144.5, "CONTRACT_SELLER_ASSOCIATE_PHONE", "seller associate phone"],
    [558.4, 420.5, 134.3, "CONTRACT_SELLER_ASSOCIATE_LICENSE_NUMBER", "seller associate license number"],
    [543.8, 216.2, 240, "CONTRACT_SELLER_SUPERVISOR_NAME", "seller supervisor name"],
    [529.4, 220, 145.8, "CONTRACT_SELLER_SUPERVISOR_PHONE", "seller supervisor phone"],
    [529.4, 421.8, 133, "CONTRACT_SELLER_SUPERVISOR_LICENSE_NUMBER", "seller supervisor license number"],

    [500.5, 50.8, 233.9, "CONTRACT_BUYER_BROKERAGE_NAME", "buyer brokerage name"],
    [486.1, 104.3, 365, "CONTRACT_BUYER_BROKERAGE_ADDRESS", "buyer brokerage address"],
    [471.7, 176.8, 130, "CONTRACT_BUYER_BROKERAGE_LICENSE_NUMBER", "buyer brokerage license number"],
    [457.2, 147.2, 240, "CONTRACT_BUYER_ASSOCIATE_NAME", "buyer associate name"],
    [442.8, 122.8, 240, "contract_buyer_team_name", "buyer team name"],
    [428.4, 145.8, 240, "CONTRACT_BUYER_ASSOCIATE_EMAIL", "buyer associate email"],
    [413.9, 167.3, 144.5, "CONTRACT_BUYER_ASSOCIATE_PHONE", "buyer associate phone"],
    [413.9, 420.5, 134.3, "CONTRACT_BUYER_ASSOCIATE_LICENSE_NUMBER", "buyer associate license number"],
    [399.5, 216.2, 240, "CONTRACT_BUYER_SUPERVISOR_NAME", "buyer supervisor name"],
    [385.1, 220, 145.8, "CONTRACT_BUYER_SUPERVISOR_PHONE", "buyer supervisor phone"],
    [385.1, 421.8, 133, "CONTRACT_BUYER_SUPERVISOR_LICENSE_NUMBER", "buyer supervisor license number"],

    [304.3, 51.6, 193.7, "CONTRACT_INTERMEDIARY_BROKERAGE_NAME", "intermediary brokerage name"],
    [289.8, 105.1, 365, "CONTRACT_INTERMEDIARY_BROKERAGE_ADDRESS", "intermediary brokerage address"],
    [275.4, 177.6, 130, "CONTRACT_INTERMEDIARY_BROKERAGE_LICENSE_NUMBER", "intermediary brokerage license number"],
    [261, 200.8, 240, "contract_intermediary_seller_associate_name", "intermediary seller associate name"],
    [246.5, 137.2, 240, "contract_intermediary_seller_team_name", "intermediary seller team name"],
    [232.1, 160.2, 240, "contract_intermediary_seller_associate_email", "intermediary seller associate email"],
    [217.6, 181.7, 130.9, "contract_intermediary_seller_associate_phone", "intermediary seller associate phone"],
    [217.6, 421.3, 134.3, "contract_intermediary_seller_associate_license_number", "intermediary seller associate license number"],
    [203.2, 230.6, 240, "contract_intermediary_seller_supervisor_name", "intermediary seller supervisor name"],
    [188.8, 234.4, 132.2, "contract_intermediary_seller_supervisor_phone", "intermediary seller supervisor phone"],
    [188.8, 422.6, 133, "contract_intermediary_seller_supervisor_license_number", "intermediary seller supervisor license number"],
    [174.2, 201.5, 240, "CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_NAME", "intermediary buyer associate name"],
    [159.8, 137.2, 240, "contract_intermediary_buyer_team_name", "intermediary buyer team name"],
    [145.4, 160.2, 240, "CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_EMAIL", "intermediary buyer associate email"],
    [130.9, 181.7, 130.9, "CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_PHONE", "intermediary buyer associate phone"],
    [130.9, 421.3, 134.3, "CONTRACT_INTERMEDIARY_BUYER_ASSOCIATE_LICENSE_NUMBER", "intermediary buyer associate license number"],
    [116.5, 230.6, 240, "CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_NAME", "intermediary buyer supervisor name"],
    [102.1, 234.4, 132.2, "CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_PHONE", "intermediary buyer supervisor phone"],
    [102.1, 422.6, 133, "CONTRACT_INTERMEDIARY_BUYER_SUPERVISOR_LICENSE_NUMBER", "intermediary buyer supervisor license number"],
  ].map(([ruleY, x, w, key, label]) =>
    text(9, key, `Page 9 ${label}`, x, onRule(ruleY), w, `Broker Contact Information rule y=${ruleY}. Page 9 is laid out like Form 11 page 11 ("Print name(s) only. Do not sign" - no signature lines in this block).`),
  ),

  // ---- Page 10 ------------------------------------------------------------
  header(10),
];

// ---------------------------------------------------------------------------
// New Global field definitions (13 condo-specific keys).
// ---------------------------------------------------------------------------

const newFields = [
  {
    field_key: "contract_condo_unit_number",
    field_name: "contract_condo_unit_number",
    field_label: "Condominium Unit Number",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "packet_property",
    source_path: "unit",
    resolver_key: null,
    required: false,
    notes:
      "P2A(1) condominium unit. properties.unit already exists and \"unit\" is already in PACKET_PROPERTY_DIRECT_SOURCE_PATHS, so this auto-fills with no schema work. Must NOT reuse PROPERTY_LOT.",
  },
  {
    field_key: "contract_condo_building",
    field_name: "contract_condo_building",
    field_label: "Condominium Building",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes:
      "P2A(1) building. No property column exists for building; manual entry only. No schema columns added. Must NOT reuse PROPERTY_BLOCK.",
  },
  {
    field_key: "contract_condo_project_name",
    field_name: "contract_condo_project_name",
    field_label: "Condominium Project Name",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes:
      "P2A(1) condominium project name. Manual entry only; no schema columns added. Must NOT reuse PROPERTY_ADDITION or HOA_ASSOCIATION_NAME.",
  },
  {
    field_key: "contract_condo_parking_assigned",
    field_name: "contract_condo_parking_assigned",
    field_label: "Assigned Parking Areas",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes:
      "P2A(1) free-text description of assigned/limited-common parking. Not equivalent to a garage_spaces count.",
  },
  {
    field_key: "contract_condo_documents_received",
    field_name: "contract_condo_documents_received",
    field_label: "Condominium Documents Received",
    field_data_type: "boolean",
    field_widget_type: "checkbox",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2B(1). Check one box only with contract_condo_documents_not_received.",
  },
  {
    field_key: "contract_condo_documents_not_received",
    field_name: "contract_condo_documents_not_received",
    field_label: "Condominium Documents Not Received",
    field_data_type: "boolean",
    field_widget_type: "checkbox",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2B(2). Check one box only with contract_condo_documents_received; drives the delivery-days blank.",
  },
  {
    field_key: "contract_condo_documents_delivery_days",
    field_name: "contract_condo_documents_delivery_days",
    field_label: "Condominium Documents Delivery Days",
    field_data_type: "number",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes:
      "P2B(2). Only meaningful when P2B(2) is checked. Data type matches the contract_seller_disclosure_delivery_days convention.",
  },
  {
    field_key: "contract_condo_certificate_received",
    field_name: "contract_condo_certificate_received",
    field_label: "Resale Certificate Received",
    field_data_type: "boolean",
    field_widget_type: "checkbox",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2C(1). Resale Certificate under Tex. Prop. Code 82.157. Check one box only across P2C(1)/(2)/(3).",
  },
  {
    field_key: "contract_condo_certificate_not_received",
    field_name: "contract_condo_certificate_not_received",
    field_label: "Resale Certificate Not Received",
    field_data_type: "boolean",
    field_widget_type: "checkbox",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2C(2). Check one box only across P2C(1)/(2)/(3).",
  },
  {
    field_key: "contract_condo_certificate_delivery_days",
    field_name: "contract_condo_certificate_delivery_days",
    field_label: "Resale Certificate Delivery Days",
    field_data_type: "number",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2C(2). Only meaningful when P2C(2) is checked.",
  },
  {
    field_key: "contract_condo_certificate_affidavit_waiver",
    field_name: "contract_condo_certificate_affidavit_waiver",
    field_label: "Resale Certificate Affidavit Waiver",
    field_data_type: "boolean",
    field_widget_type: "checkbox",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2C(3). Third option in the same check-one-box-only group; waiver path when the Association fails to provide a Certificate.",
  },
  {
    field_key: "contract_condo_right_of_refusal_certification_days",
    field_name: "contract_condo_right_of_refusal_certification_days",
    field_label: "Right of Refusal Certification Days",
    field_data_type: "number",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes: "P2D right-of-refusal certification window. No 1-4 analogue.",
  },
  {
    field_key: "contract_condo_association_transfer_charges_cap",
    field_name: "contract_condo_association_transfer_charges_cap",
    field_label: "Association Transfer Charges Cap",
    field_data_type: "currency",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    required: false,
    notes:
      "P12A(3). Deliberately separate from hoa_addendum_transfer_fee_cap, which belongs to the HOA addendum form; keeping them separate avoids cross-form value bleed.",
  },
];

// ---------------------------------------------------------------------------
// Resolve every placement against the catalog and emit the manifest.
// ---------------------------------------------------------------------------

const catalog = readJson("_audit_tmp/active_global_fields.json");
const catalogByKey = new Map(catalog.map((f) => [f.field_key, f]));
const newByKey = new Map(newFields.map((f) => [f.field_key, f]));

const errors = [];
const mappings = placements.map((p) => {
  const existing = catalogByKey.get(p.key);
  const created = newByKey.get(p.key);

  if (existing && created) errors.push(`${p.key}: declared new but already in the catalog`);
  if (!existing && !created) errors.push(`${p.key}: not found in active_global_fields.json and not declared as new`);
  if (existing && (existing.status !== "ACTIVE" || existing.scope !== "GLOBAL")) {
    errors.push(`${p.key}: catalog row is ${existing.status}/${existing.scope}, expected ACTIVE/GLOBAL`);
  }

  const def = existing ?? created;
  const widget = p.widget ?? (def ? def.field_widget_type : "text");

  return {
    page_number: p.page,
    field_key: p.key,
    reuseOrNew: existing ? "reuse" : "new",
    existing_field_id: existing ? existing.id : null,
    field_widget_type: widget,
    source_type: def ? def.source_type : null,
    source_path: def ? def.source_path : null,
    resolver_key: def ? def.resolver_key : null,
    mapping_name: p.name,
    x: round(p.x),
    y: round(p.y),
    width: round(p.w),
    height: round(p.h),
    page_width: PAGE_WIDTH,
    page_height: PAGE_HEIGHT,
    occurrence_index: 0,
    required: false,
    notes: p.note,
  };
});

if (errors.length) {
  console.error("Validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

const AUTO_SOURCES = new Set(["packet_property", "packet_contact", "settings_agent", "settings_brokerage"]);
const count = (fn) => mappings.filter(fn).length;

const expectedCounts = {
  mappings: mappings.length,
  reuse: count((m) => m.reuseOrNew === "reuse"),
  new: count((m) => m.reuseOrNew === "new"),
  text: count((m) => m.field_widget_type === "text"),
  checkbox: count((m) => m.field_widget_type === "checkbox"),
  date: count((m) => m.field_widget_type === "date"),
  auto_source: count((m) => AUTO_SOURCES.has(m.source_type)),
  custom_resolver: count((m) => m.source_type === "custom_resolver"),
  manual_only: count((m) => m.source_type === "manual_only"),
  source_type_unset: count((m) => m.source_type === null),
};

const pdfBytes = read("assets/forms/CondoListing.pdf");

const manifest = {
  manifestVersion: 1,
  form: {
    stableIdentity: {
      form_code: "TXR-1605",
      version_label: "TXR-1605-05-04-2026",
      form_name: "Residential Condominium Contract (Resale)",
      form_category: "CONTRACT",
      state_code: "TX",
    },
    description:
      "TREC 30-18 / TXR 1605 Residential Condominium Contract (Resale), revision 05-04-2026",
    scope: "GLOBAL",
    status: "ACTIVE",
    pdf: {
      localPath: "assets/forms/CondoListing.pdf",
      storagePathTemplate: "global/forms/{formId}/CondoListing.pdf",
      bytes: pdfBytes.length,
      md5: crypto.createHash("md5").update(pdfBytes).digest("hex"),
      sha256: crypto.createHash("sha256").update(pdfBytes).digest("hex"),
      pages: 10,
      acroFormFields: 0,
    },
  },
  coordinateConvention: {
    origin: "top-left",
    units: "PDF points",
    page_width: PAGE_WIDTH,
    page_height: PAGE_HEIGHT,
    notes:
      "Same convention as Form 11 (TXR-1601). Placements were derived from CondoListing.pdf rule and text geometry, not copied verbatim from Form 11, because the condo form is 10 pages against Form 11's 12. They are approximate starting rectangles intended to be finalized in Map Fields.",
  },
  newFields,
  mappings,
  deviations: [
    "Removed the property_legal_description row for the page-1 full-width rule (y=602.4) that sits between the \"County of ____,\" blank and the preprinted word \"Texas\". That slot is part of the county/legal continuation line, not a separate mapped field. PROPERTY_STATE must never be used there (it would render \"Texas, Texas\"). A single property_county mapping (980830bf-8d4d-4bbe-8f4d-026453594617, packet_property.county) covers the County blank at rule y=611.4, x=454-550.2.",
    "Replaced the three optional execution-block rows (contract_effective_day / contract_effective_month / contract_effective_year) with one contract_effective_date mapping (80c114e9-d1d9-4277-bb01-239f0437afa8) on the page-8 EXECUTED line, using field_widget_type \"date\" to match the contract_closing_date mapping convention. This is a deliberate divergence from Form 11, which leaves the execution date entirely unmapped; it is not a signature line.",
    "\"Located at (address/zip code)\" on page 1 reuses PROPERTY_ADDRESS_ZIP (844c64f4-b9a5-4b7b-9d42-939d556a1c7e) bound to packet_property.address_city_state_zip, matching Form 11's treatment of its \"known as ____ (address/zip code)\" blank. The second continuation rule (y=620.5) is left as unmapped overflow.",
    "Condominium building and project name are new manual_only fields with null source_path and null resolver_key. No properties columns and no other schema changes are proposed.",
    "contract_condo_unit_number is new and bound to packet_property.unit. properties.unit already exists and \"unit\" is already an allowed direct source path, so no migration is required.",
    "All signature, initials, and receipt signing blanks are excluded (roughly 72 controls): the page 1-10 initials strips, the four page-8 party signature rules, the page-8 attorney Fax rules, and every page-10 receipt block. Page 10 carries only the Contract Concerning header, exactly as Form 11 treats its page 12.",
    "Form 11 clusters with no condo counterpart are intentionally absent: natural-resource lease fields, all survey-option and boundary-exception amendment fields, HOA subject/not-subject, water disclosure fields, contract_add_hoa, and contract_add_mineral_reservation.",
    "seller_city_state_zip (4892e7cf-cec6-44ff-8d09-968231ac07f1) is mapped on the page-7 seller address continuation rule. Form 11 leaves that rule unmapped, so this is an intentional small improvement rather than strict parity; drop this mapping if strict Form 11 parity is preferred.",
    "CONTRACT_SPECIAL_PROVISIONS (da9e14f5-6f26-4d0a-9f13-7e8097fed433) still carries source_type NULL in the catalog, so it is counted under source_type_unset rather than manual_only. Recommend normalizing that catalog row to manual_only when this form is built; the mapping itself needs no change.",
    "contract_closing_date and contract_effective_date both store field_widget_type \"date\" at the mapping level (matching the existing Form 11 closing-date mapping) even though their catalog rows store field_widget_type \"text\" with field_data_type \"date\".",
    "Multi-line blanks (parking, exclusions, title objection use/activity, specific repairs, special provisions, district notices text, other addendum text) are mapped as a single field on the first line, per Form 11 practice.",
    "No defaults of any kind are included. Personal and Organization defaults are set later in Map Fields.",
  ],
  expectedCounts,
};

const outPath = path.join(here, "manifest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
console.log(expectedCounts);

const perPage = {};
for (const m of mappings) perPage[m.page_number] = (perPage[m.page_number] || 0) + 1;
console.log("mappings per page:", perPage);
