-- Packets use ACTIVE and DELETED only.
-- Forward-only. Do not edit prior migrations.
--
-- `packets_status_check` came from the initial schema's generic
-- ACTIVE / INACTIVE / DELETED template. INACTIVE never had a Packet business
-- meaning: the only writer was an unexplained Status select on the Packet edit
-- form, and the code disagreed about it (hidden from the list and unusable for
-- Fill Form resolution and soft delete, yet allowed as a Signing source).
--
-- Normalization: an INACTIVE Packet becomes ACTIVE. Deletion is a separate,
-- explicit action (status DELETED), so INACTIVE is not evidence of intent to
-- delete. Inspect the target's INACTIVE rows before applying; development had
-- exactly one (Packet 12, an owner-set test Packet with ACTIVE forms and
-- contacts). Ownership and every other column are left unchanged; only
-- `update_date` moves, through the existing trigger.
--
-- Packet-specific only: other tables keep their own INACTIVE semantics
-- (for example retired Form versions).

begin;

update public.packets
   set status = 'ACTIVE'
 where status = 'INACTIVE';

alter table public.packets
  drop constraint if exists packets_status_check;

alter table public.packets
  add constraint packets_status_check
    check (status in ('ACTIVE', 'DELETED'));

comment on constraint packets_status_check on public.packets is
  'Packets are ACTIVE or soft-deleted (DELETED). There is no Packet INACTIVE state.';

commit;
