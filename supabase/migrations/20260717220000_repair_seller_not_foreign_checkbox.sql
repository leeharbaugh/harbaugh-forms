-- Restore SELLER_IS_NOT_FOREIGN_PERSON historical packet checkbox and Lee Private
-- preference omitted from 20260715180000 (field cleared from Global catalog without
-- a matching field_defaults insert).
--
-- Forward-only. Does not edit 20260717210000. Does not restore Global catalog
-- defaults. Does not touch the opposite seller_is_foreign_person instance.

begin;

-- ---------------------------------------------------------------------------
-- 1. Abbas packet-form 28 instance repair
-- ---------------------------------------------------------------------------

do $$
declare
  v_matched integer;
  v_updated integer;
  v_instance_id uuid := '045341ab-61a4-4070-93db-8eb3f0a08f15'::uuid;
  v_packet_form_id bigint := 28;
  v_field_id uuid := 'b0548c8b-c4f7-44f9-8328-9c14899e09e7'::uuid;
  v_incident_update timestamptz := '2026-07-17T19:03:54.152124+00:00'::timestamptz;
begin
  select count(*)::integer
  into v_matched
  from public.field_instances fi
  where fi.id = v_instance_id
    and fi.status = 'ACTIVE'
    and fi.packet_form_id = v_packet_form_id
    and fi.field_id = v_field_id
    and fi.is_override = false
    and fi.source = 'empty'
    and fi.value = 'false'
    and fi.value_json is not null
    and (fi.value_json ->> 'checked') = 'false'
    and fi.update_date = v_incident_update;

  raise notice 'seller_not_foreign_instance_repair matched_preconditions=%', v_matched;

  update public.field_instances fi
  set
    value = 'true',
    value_json = jsonb_build_object('checked', true),
    source = 'manual_override',
    is_override = true,
    notes = coalesce(
      nullif(btrim(fi.notes), ''),
      'Restored after 2026-07-17 catalog-clear open-time overwrite; evidence-based historical checkbox.'
    ),
    update_date = now()
  where fi.id = v_instance_id
    and fi.status = 'ACTIVE'
    and fi.packet_form_id = v_packet_form_id
    and fi.field_id = v_field_id
    and fi.is_override = false
    and fi.source = 'empty'
    and fi.value = 'false'
    and fi.value_json is not null
    and (fi.value_json ->> 'checked') = 'false'
    and fi.update_date = v_incident_update;

  get diagnostics v_updated = row_count;
  raise notice 'seller_not_foreign_instance_repair rows_updated=%', v_updated;

  if v_updated <> v_matched then
    raise exception
      'seller_not_foreign_instance_repair mismatch: matched=% updated=%',
      v_matched,
      v_updated;
  end if;

  if v_updated not in (0, 1) then
    raise exception
      'seller_not_foreign_instance_repair unexpected update count=%',
      v_updated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lee Private default restoration (field-level; form_id / mapping null)
-- ---------------------------------------------------------------------------

do $$
declare
  v_lee uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99'::uuid;
  v_yahoo uuid := '8d10af59-f3f8-4a48-94b5-3477656c02a6'::uuid;
  v_field_id uuid := 'b0548c8b-c4f7-44f9-8328-9c14899e09e7'::uuid;
  v_active_count integer;
  v_inactive_count integer;
  v_inserted integer;
begin
  if not exists (select 1 from public.profiles p where p.id = v_lee) then
    raise exception 'seller_not_foreign_private_default: Lee profile % missing', v_lee;
  end if;

  select count(*)::integer
  into v_active_count
  from public.field_defaults fd
  where fd.field_id = v_field_id
    and fd.scope = 'PRIVATE'
    and fd.owner_user_id = v_lee
    and fd.status = 'ACTIVE'
    and coalesce(fd.form_id, 0) = 0
    and coalesce(
      fd.form_field_mapping_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ) = '00000000-0000-0000-0000-000000000000'::uuid;

  select count(*)::integer
  into v_inactive_count
  from public.field_defaults fd
  where fd.field_id = v_field_id
    and fd.scope = 'PRIVATE'
    and fd.owner_user_id = v_lee
    and fd.status in ('INACTIVE', 'DELETED');

  if v_inactive_count > 0 and v_active_count = 0 then
    raise exception
      'seller_not_foreign_private_default: inactive/deleted Lee Private row exists for field %; refusing duplicate insert',
      v_field_id;
  end if;

  if v_active_count > 1 then
    raise exception
      'seller_not_foreign_private_default: unexpected ACTIVE Lee Private count=% for field %',
      v_active_count,
      v_field_id;
  end if;

  insert into public.field_defaults (
    field_id,
    form_id,
    form_field_mapping_id,
    default_value,
    default_checked,
    scope,
    owner_user_id,
    organization_id,
    notes,
    created_by_user_id
  )
  select
    v_field_id,
    null::bigint,
    null::uuid,
    null::text,
    true,
    'PRIVATE',
    v_lee,
    null::uuid,
    'Restored pre-multi-user Lee preference omitted from 20260715180000 (catalog cleared without Private insert).',
    v_lee
  where v_active_count = 0
    and not exists (
      select 1
      from public.field_defaults fd
      where fd.field_id = v_field_id
        and fd.scope = 'PRIVATE'
        and fd.owner_user_id = v_lee
        and fd.status = 'ACTIVE'
    );

  get diagnostics v_inserted = row_count;
  raise notice 'seller_not_foreign_private_default inserted=% prior_active=%',
    v_inserted,
    v_active_count;

  if exists (
    select 1
    from public.field_defaults fd
    where fd.field_id = v_field_id
      and fd.scope = 'PRIVATE'
      and fd.owner_user_id = v_yahoo
      and fd.status = 'ACTIVE'
  ) then
    raise exception
      'seller_not_foreign_private_default: unexpected Yahoo Private default present';
  end if;

  if (
    select count(*)::integer
    from public.field_defaults fd
    where fd.field_id = v_field_id
      and fd.scope = 'PRIVATE'
      and fd.owner_user_id = v_lee
      and fd.status = 'ACTIVE'
  ) <> 1 then
    raise exception
      'seller_not_foreign_private_default: Lee must have exactly one ACTIVE Private default';
  end if;

  -- Global catalog must remain without preference literals for this field.
  if exists (
    select 1
    from public.fields f
    where f.id = v_field_id
      and (
        f.default_value is not null
        or f.default_checked is not null
        or f.fallback_value is not null
      )
  ) then
    raise exception
      'seller_not_foreign_private_default: Global catalog literals unexpectedly present';
  end if;
end $$;

commit;
