-- Backfill packet_instance for canonical packet-specific fields that have no explicit source_type.
-- Skips fields that already have a global mapping (e.g. listing_price → listing_agreement_details).

update public.fields
set
  source_type = 'packet_instance',
  source_path = null,
  resolver_key = null
where status = 'ACTIVE'
  and source_type is null
  and field_key in (
    'special_provisions',
    'listing_price',
    'earnest_money',
    'option_fee',
    'seller_contribution',
    'hoa_transfer_fee',
    'custom_contract_language',
    'transaction_notes',
    'buyer_specific_terms'
  );
