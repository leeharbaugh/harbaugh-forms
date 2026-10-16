-- Add AGENT as a Packet contact role (transaction party, not app authority).
-- Forward-only; development first. Maps to Signing participant role AGENT.

alter table public.packet_contacts
  drop constraint if exists packet_contacts_packet_role_check;

alter table public.packet_contacts
  add constraint packet_contacts_packet_role_check
    check (
      packet_role in (
        'PRIMARY',
        'CO_CLIENT',
        'SPOUSE',
        'POWER_OF_ATTORNEY',
        'BUYER',
        'TENANT',
        'SELLER',
        'LANDLORD',
        'AGENT',
        'OTHER'
      )
    );
