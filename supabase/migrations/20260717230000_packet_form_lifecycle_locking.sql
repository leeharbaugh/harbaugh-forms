-- Packet-form lifecycle locking for field-instance mutations and document_state
-- transitions (DRAFT <-> FINAL). Does not change existing document_state values.
--
-- Authenticated clients may mutate field_instances only when the parent ACTIVE
-- packet form is DRAFT. Privileged sessions (auth.uid() is null) retain access
-- for migrations and administrative SQL.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.packet_form_is_draft_editable(p_packet_form_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.packet_forms pf
    where pf.id = p_packet_form_id
      and pf.status = 'ACTIVE'
      and pf.document_state = 'DRAFT'
  );
$$;

comment on function public.packet_form_is_draft_editable(bigint) is
  'True when the packet form is ACTIVE and DRAFT (field values may be mutated).';

revoke all on function public.packet_form_is_draft_editable(bigint) from public;
grant execute on function public.packet_form_is_draft_editable(bigint) to authenticated;

create or replace function public.enforce_packet_form_document_state_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.document_state is not distinct from old.document_state then
    return new;
  end if;

  -- Privileged / migration sessions (no JWT user) may set any allowed state.
  if auth.uid() is null then
    return new;
  end if;

  if old.status <> 'ACTIVE' or new.status <> 'ACTIVE' then
    raise exception
      'document_state can only change on ACTIVE packet forms (packet_form_id=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  if not (
    (old.document_state = 'DRAFT' and new.document_state = 'FINAL')
    or (old.document_state = 'FINAL' and new.document_state = 'DRAFT')
  ) then
    raise exception
      'invalid packet form document_state transition: % -> % (packet_form_id=%)',
      old.document_state,
      new.document_state,
      old.id
      using errcode = 'check_violation';
  end if;

  if not (
    public.is_app_admin()
    or new.owner_user_id = auth.uid()
  ) then
    raise exception
      'not authorized to change document_state for packet_form_id=%',
      old.id
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists packet_forms_enforce_document_state_transition
  on public.packet_forms;

create trigger packet_forms_enforce_document_state_transition
before update of document_state on public.packet_forms
for each row
execute function public.enforce_packet_form_document_state_transition();

-- ---------------------------------------------------------------------------
-- field_instances: require ACTIVE DRAFT parent for INSERT/UPDATE
-- ---------------------------------------------------------------------------

drop policy if exists "field_instances_insert" on public.field_instances;
drop policy if exists "field_instances_update" on public.field_instances;

create policy "field_instances_insert"
  on public.field_instances
  for insert
  to authenticated
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  );

create policy "field_instances_update"
  on public.field_instances
  for update
  to authenticated
  using (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = field_instances.packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  )
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  );

-- ---------------------------------------------------------------------------
-- field_instance_mappings: same DRAFT gate for placement overrides
-- ---------------------------------------------------------------------------

drop policy if exists "field_instance_mappings_insert"
  on public.field_instance_mappings;
drop policy if exists "field_instance_mappings_update"
  on public.field_instance_mappings;

create policy "field_instance_mappings_insert"
  on public.field_instance_mappings
  for insert
  to authenticated
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  );

create policy "field_instance_mappings_update"
  on public.field_instance_mappings
  for update
  to authenticated
  using (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = field_instance_mappings.packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  )
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
        and pf.status = 'ACTIVE'
        and pf.document_state = 'DRAFT'
    )
  );

commit;
