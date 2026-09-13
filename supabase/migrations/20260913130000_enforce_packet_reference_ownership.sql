-- F7: Prevent packet references from crossing user/organization boundaries.
-- Browser RLS can hide a foreign row after it is linked, but privileged packet
-- processing can otherwise materialize that hidden data into packet instances.

begin;

create or replace function public.enforce_packet_reference_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_owner uuid;
begin
  -- Trusted maintenance/migrations remain explicit service-role operations.
  if auth.uid() is null then
    return new;
  end if;

  -- The owner-assignment trigger also forces this value for ordinary users.
  -- Derive it here so trigger ordering cannot validate a spoofed owner.
  v_packet_owner := new.owner_user_id;
  if not public.is_app_admin() then
    v_packet_owner := auth.uid();
  end if;

  if v_packet_owner is null then
    raise exception 'A packet reference requires an owner'
      using errcode = 'check_violation';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id
      and p.owner_user_id = v_packet_owner
      and p.status = 'ACTIVE'
  ) then
    raise exception 'The selected property is not available to this packet'
      using errcode = 'check_violation';
  end if;

  if new.representation_agreement_id is not null and not exists (
    select 1 from public.representation_agreements ra
    where ra.id = new.representation_agreement_id
      and ra.owner_user_id = v_packet_owner
      and ra.status = 'ACTIVE'
  ) then
    raise exception 'The selected representation agreement is not available to this packet'
      using errcode = 'check_violation';
  end if;

  if new.collection_id is not null and not exists (
    select 1 from public.collections c
    where c.id = new.collection_id
      and c.status = 'ACTIVE'
      and (
        c.scope = 'GLOBAL'
        or (c.scope = 'PRIVATE' and c.owner_user_id = v_packet_owner)
        or (
          c.scope = 'ORGANIZATION'
          and c.organization_id is not null
          and exists (
            select 1
            from public.organization_members om
            join public.organizations o on o.id = om.organization_id
            where om.organization_id = c.organization_id
              and om.user_id = v_packet_owner
              and om.status = 'ACTIVE'
              and o.status = 'ACTIVE'
          )
        )
      )
  ) then
    raise exception 'The selected collection is not available to this packet'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists packets_enforce_reference_ownership on public.packets;
create trigger packets_enforce_reference_ownership
before insert or update of owner_user_id, property_id, representation_agreement_id, collection_id
on public.packets
for each row execute function public.enforce_packet_reference_ownership();

comment on function public.enforce_packet_reference_ownership() is
  'Ensures packet property, representation agreement, and collection references are valid for the packet owner before an authenticated write.';

commit;
