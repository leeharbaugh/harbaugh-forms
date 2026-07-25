-- Allow custom packets without a collection template.
-- Files remain packet_forms (including external_upload); no parallel storage.

alter table public.packets
  alter column collection_id drop not null;

alter table public.packets
  drop constraint if exists packets_packet_type_check;

alter table public.packets
  add constraint packets_packet_type_check
    check (
      packet_type is null
      or packet_type in (
        'buyer_rep',
        'listing',
        'contract_offer',
        'custom'
      )
    );

-- Custom packets must not reference a collection; collection packets keep a collection.
alter table public.packets
  drop constraint if exists packets_custom_collection_null_check;

alter table public.packets
  add constraint packets_custom_collection_null_check
    check (
      (packet_type = 'custom' and collection_id is null)
      or (packet_type is distinct from 'custom')
    );
