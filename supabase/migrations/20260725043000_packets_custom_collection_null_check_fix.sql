-- Correct packets_custom_collection_null_check so non-custom packets
-- (including legacy packet_type IS NULL) still require collection_id.
-- Replaces the weaker check introduced by 20260725040000.
-- No data rewrite.

alter table public.packets
  drop constraint if exists packets_custom_collection_null_check;

alter table public.packets
  add constraint packets_custom_collection_null_check
    check (
      (
        packet_type = 'custom'
        and collection_id is null
      )
      or
      (
        packet_type is distinct from 'custom'
        and collection_id is not null
      )
    );
