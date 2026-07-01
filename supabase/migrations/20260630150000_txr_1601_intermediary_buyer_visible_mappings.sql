-- TREC 20-19 / TXR 1601: fix page 11 buyer intermediary mappings to visible coordinates (y <= 792).
-- Reactivates inactive/off-page mappings; no hard deletes.

-- ---------------------------------------------------------------------------
-- Resolve TXR 1601 / TREC 20-19 One to Four Contract form
-- ---------------------------------------------------------------------------

create temp table txr_1601_form on commit drop as
select f.id as form_id
from public.forms f
where f.status = 'ACTIVE'
  and (
    lower(trim(f.form_code)) in (
      'txr-1601',
      'txr_1601',
      'trec-20-19',
      'trec_20_19'
    )
    or lower(trim(f.form_code)) like '%txr-1601%'
    or lower(trim(f.form_code)) like '%txr_1601%'
    or lower(trim(f.form_code)) like '%trec-20-19%'
    or lower(trim(f.form_code)) like '%trec_20_19%'
    or (
      lower(f.form_name) like '%one%four%'
      and lower(f.form_name) like '%contract%'
    )
    or (
      lower(f.form_name) like '%one-to-four%'
      and lower(f.form_name) like '%contract%'
    )
  )
order by
  case
    when lower(trim(f.form_code)) in ('txr-1601', 'txr_1601', 'trec-20-19', 'trec_20_19') then 0
    else 1
  end,
  case when lower(f.form_name) like '%txr-1601%' or lower(f.form_name) like '%trec-20-19%' then 0 else 1 end,
  f.id
limit 1;

-- ---------------------------------------------------------------------------
-- Field source corrections (buyer agent from brokerage_settings)
-- ---------------------------------------------------------------------------

create temp table txr_1601_buyer_intermediary_fields_touched (
  field_key text primary key,
  field_id uuid,
  action text not null
) on commit drop;

with field_seed (
  field_key,
  field_name,
  field_label,
  field_data_type,
  field_widget_type,
  default_value,
  default_checked,
  required,
  notes,
  source_type,
  source_path,
  resolver_key
) as (
  values
    (
      'contract_intermediary_buyer_associate_name',
      'contract_intermediary_buyer_associate_name',
      'Intermediary Buyer Associate Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary associate name (agent full name from settings).',
      'settings_agent',
      'agent_full_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_team_name',
      'contract_intermediary_buyer_team_name',
      'Intermediary Buyer Team Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary team name (manual; no team source).',
      'manual_only',
      null::text,
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_email',
      'contract_intermediary_buyer_associate_email',
      'Intermediary Buyer Associate Email',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary associate email from agent settings.',
      'settings_agent',
      'agent_email',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_phone',
      'contract_intermediary_buyer_associate_phone',
      'Intermediary Buyer Associate Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary associate phone from agent settings.',
      'settings_agent',
      'agent_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_associate_license_number',
      'contract_intermediary_buyer_associate_license_number',
      'Intermediary Buyer Associate License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary associate license from agent settings.',
      'settings_agent',
      'agent_license_number',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_name',
      'contract_intermediary_buyer_supervisor_name',
      'Intermediary Buyer Licensed Supervisor Name',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary supervisor name from brokerage settings.',
      'settings_brokerage',
      'supervisor_name',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_phone',
      'contract_intermediary_buyer_supervisor_phone',
      'Intermediary Buyer Licensed Supervisor Phone',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary supervisor phone from brokerage settings.',
      'settings_brokerage',
      'supervisor_phone',
      null::text
    ),
    (
      'contract_intermediary_buyer_supervisor_license_number',
      'contract_intermediary_buyer_supervisor_license_number',
      'Intermediary Buyer Licensed Supervisor License Number',
      'text',
      'text',
      null::text,
      null::boolean,
      false,
      'TREC 20-19 / TXR 1601 page 11 · Buyer intermediary supervisor license from brokerage settings.',
      'settings_brokerage',
      'supervisor_license_number',
      null::text
    )
),
inserted_fields as (
  insert into public.fields (
    field_key,
    field_name,
    field_label,
    field_data_type,
    field_widget_type,
    default_value,
    default_checked,
    required,
    notes,
    source_type,
    source_path,
    resolver_key,
    status
  )
  select
    s.field_key,
    s.field_name,
    s.field_label,
    s.field_data_type,
    s.field_widget_type,
    s.default_value,
    s.default_checked,
    s.required,
    s.notes,
    s.source_type,
    s.source_path,
    s.resolver_key,
    'ACTIVE'
  from field_seed s
  where not exists (
    select 1
    from public.fields existing
    where lower(existing.field_key) = lower(s.field_key)
      and existing.status = 'ACTIVE'
  )
  returning field_key, id as field_id
),
updated_fields as (
  update public.fields target
  set
    field_name = s.field_name,
    field_label = s.field_label,
    field_data_type = s.field_data_type,
    field_widget_type = s.field_widget_type,
    default_value = s.default_value,
    default_checked = s.default_checked,
    required = s.required,
    notes = s.notes,
    source_type = s.source_type,
    source_path = s.source_path,
    resolver_key = s.resolver_key,
    update_date = now()
  from field_seed s
  where lower(target.field_key) = lower(s.field_key)
    and target.status = 'ACTIVE'
  returning target.field_key, target.id as field_id
)
insert into txr_1601_buyer_intermediary_fields_touched (field_key, field_id, action)
select field_key, field_id, 'inserted' from inserted_fields
union all
select field_key, field_id, 'updated' from updated_fields;

-- Backfill field_id for untouched rows (already correct)
insert into txr_1601_buyer_intermediary_fields_touched (field_key, field_id, action)
select fld.field_key, fld.id, 'unchanged'
from public.fields fld
where fld.status = 'ACTIVE'
  and fld.field_key in (
    'contract_intermediary_buyer_associate_name',
    'contract_intermediary_buyer_team_name',
    'contract_intermediary_buyer_associate_email',
    'contract_intermediary_buyer_associate_phone',
    'contract_intermediary_buyer_associate_license_number',
    'contract_intermediary_buyer_supervisor_name',
    'contract_intermediary_buyer_supervisor_phone',
    'contract_intermediary_buyer_supervisor_license_number'
  )
  and not exists (
    select 1
    from txr_1601_buyer_intermediary_fields_touched t
    where lower(t.field_key) = lower(fld.field_key)
  );

-- ---------------------------------------------------------------------------
-- Visible page 11 placement seed (y in [0, 792])
-- ---------------------------------------------------------------------------

create temp table txr_1601_buyer_intermediary_placement_seed (
  field_key text not null,
  mapping_name text not null,
  occurrence_index integer,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  field_widget_type text not null
) on commit drop;

insert into txr_1601_buyer_intermediary_placement_seed (
  field_key,
  mapping_name,
  occurrence_index,
  page_number,
  x,
  y,
  width,
  height,
  field_widget_type
)
values
  (
    'contract_intermediary_buyer_associate_name',
    'Page 11 intermediary buyer associate name',
    null::integer,
    11,
    190,
    640,
    230,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_team_name',
    'Page 11 intermediary buyer team name',
    null::integer,
    11,
    115,
    660,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_email',
    'Page 11 intermediary buyer associate email',
    null::integer,
    11,
    150,
    680,
    250,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_phone',
    'Page 11 intermediary buyer associate phone',
    null::integer,
    11,
    175,
    700,
    125,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_associate_license_number',
    'Page 11 intermediary buyer associate license number',
    null::integer,
    11,
    420,
    700,
    125,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_name',
    'Page 11 intermediary buyer licensed supervisor name',
    null::integer,
    11,
    220,
    720,
    240,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_phone',
    'Page 11 intermediary buyer licensed supervisor phone',
    null::integer,
    11,
    245,
    740,
    125,
    14,
    'text'
  ),
  (
    'contract_intermediary_buyer_supervisor_license_number',
    'Page 11 intermediary buyer licensed supervisor license number',
    null::integer,
    11,
    445,
    740,
    125,
    14,
    'text'
  );

create temp table txr_1601_buyer_intermediary_mapping_report (
  field_key text not null,
  field_id uuid,
  mapping_id uuid,
  page_number integer not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  status text not null,
  action text not null
) on commit drop;

-- Deactivate active mappings on wrong page
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1601_form tf,
     public.fields fld,
     txr_1601_buyer_intermediary_placement_seed ps
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and lower(fld.field_key) = lower(ps.field_key)
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and ffm.page_number <> ps.page_number;

-- Deactivate active off-page mappings on page 11 (y beyond 792)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1601_form tf,
     public.fields fld,
     txr_1601_buyer_intermediary_placement_seed ps
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and lower(fld.field_key) = lower(ps.field_key)
  and fld.status = 'ACTIVE'
  and ffm.status = 'ACTIVE'
  and ffm.page_number = ps.page_number
  and (ffm.y < 0 or ffm.y + coalesce(ffm.height, 14) > 792);

-- Reactivate/update one existing row per field for target page (ACTIVE or INACTIVE)
with reactivated as (
  update public.form_field_mappings ffm
  set
    mapping_name = ps.mapping_name,
    x = ps.x,
    y = ps.y,
    width = ps.width,
    height = ps.height,
    page_width = 612,
    page_height = 792,
    font_size = 9,
    field_widget_type = ps.field_widget_type,
    notes = 'TREC 20-19 / TXR 1601 intermediary buyer visible page 11 placement',
    status = 'ACTIVE',
    update_date = now()
  from txr_1601_form tf,
       txr_1601_buyer_intermediary_placement_seed ps,
       public.fields fld
  where ffm.form_id = tf.form_id
    and ffm.field_id = fld.id
    and lower(fld.field_key) = lower(ps.field_key)
    and fld.status = 'ACTIVE'
    and ffm.page_number = ps.page_number
    and coalesce(ffm.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
    and ffm.id = (
      select ffm_pick.id
      from public.form_field_mappings ffm_pick
      where ffm_pick.form_id = tf.form_id
        and ffm_pick.field_id = fld.id
        and ffm_pick.page_number = ps.page_number
        and coalesce(ffm_pick.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
      order by
        case when ffm_pick.status = 'ACTIVE' then 0 else 1 end,
        ffm_pick.update_date desc,
        ffm_pick.id
      limit 1
    )
  returning
    fld.field_key,
    fld.id as field_id,
    ffm.id as mapping_id,
    ffm.page_number,
    ffm.x,
    ffm.y,
    ffm.width,
    ffm.height,
    ffm.status,
    'updated' as action
)
insert into txr_1601_buyer_intermediary_mapping_report (
  field_key,
  field_id,
  mapping_id,
  page_number,
  x,
  y,
  width,
  height,
  status,
  action
)
select
  field_key,
  field_id,
  mapping_id,
  page_number,
  x,
  y,
  width,
  height,
  status,
  action
from reactivated;

-- Insert missing mappings
with inserted as (
  insert into public.form_field_mappings (
    form_id,
    field_id,
    mapping_name,
    occurrence_index,
    page_number,
    x,
    y,
    width,
    height,
    page_width,
    page_height,
    font_size,
    field_widget_type,
    notes,
    status
  )
  select
    tf.form_id,
    fld.id,
    ps.mapping_name,
    ps.occurrence_index,
    ps.page_number,
    ps.x,
    ps.y,
    ps.width,
    ps.height,
    612,
    792,
    9,
    ps.field_widget_type,
    'TREC 20-19 / TXR 1601 intermediary buyer visible page 11 placement',
    'ACTIVE'
  from txr_1601_buyer_intermediary_placement_seed ps
  inner join txr_1601_form tf on true
  inner join public.fields fld
    on lower(fld.field_key) = lower(ps.field_key)
   and fld.status = 'ACTIVE'
  where not exists (
    select 1
    from public.form_field_mappings existing
    where existing.form_id = tf.form_id
      and existing.field_id = fld.id
      and existing.page_number = ps.page_number
      and coalesce(existing.occurrence_index, -1) = coalesce(ps.occurrence_index, -1)
      and existing.status = 'ACTIVE'
  )
  returning
    (select field_key from public.fields where id = field_id) as field_key,
    field_id,
    id as mapping_id,
    page_number,
    x,
    y,
    width,
    height,
    status
)
insert into txr_1601_buyer_intermediary_mapping_report (
  field_key,
  field_id,
  mapping_id,
  page_number,
  x,
  y,
  width,
  height,
  status,
  action
)
select field_key, field_id, mapping_id, page_number, x, y, width, height, status, 'inserted'
from inserted;

-- Deactivate duplicate active mappings (keep the row in report)
update public.form_field_mappings ffm
set
  status = 'INACTIVE',
  update_date = now()
from txr_1601_form tf,
     public.fields fld,
     txr_1601_buyer_intermediary_placement_seed ps,
     txr_1601_buyer_intermediary_mapping_report rep
where ffm.form_id = tf.form_id
  and ffm.field_id = fld.id
  and lower(fld.field_key) = lower(ps.field_key)
  and lower(rep.field_key) = lower(ps.field_key)
  and ffm.status = 'ACTIVE'
  and ffm.id <> rep.mapping_id;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

do $$
declare
  v_form_id bigint;
  rec record;
  v_missing text;
begin
  select form_id into v_form_id from txr_1601_form limit 1;

  raise notice 'TREC 20-19 / TXR 1601 intermediary buyer visible mappings report';
  raise notice '  form_id: %', coalesce(v_form_id::text, 'NOT FOUND');

  for rec in
    select
      r.field_key,
      coalesce(r.field_id, ft.field_id) as field_id,
      r.mapping_id,
      r.page_number,
      r.x,
      r.y,
      r.width,
      r.height,
      r.status,
      r.action
    from txr_1601_buyer_intermediary_mapping_report r
    left join txr_1601_buyer_intermediary_fields_touched ft
      on lower(ft.field_key) = lower(r.field_key)
    order by r.y, r.field_key
  loop
    raise notice '  % | field_id=% | mapping_id=% | page=% | x=% y=% w=% h=% | status=% | %',
      rec.field_key,
      coalesce(rec.field_id::text, 'NULL'),
      coalesce(rec.mapping_id::text, 'NULL'),
      rec.page_number,
      rec.x,
      rec.y,
      rec.width,
      rec.height,
      rec.status,
      rec.action;
  end loop;

  select string_agg(ps.field_key, ', ' order by ps.field_key)
  into v_missing
  from txr_1601_buyer_intermediary_placement_seed ps
  left join txr_1601_buyer_intermediary_mapping_report rep
    on lower(rep.field_key) = lower(ps.field_key)
   and rep.status = 'ACTIVE'
  where rep.field_key is null;

  if v_missing is not null then
    raise notice '  MISSING ACTIVE MAPPINGS: %', v_missing;
  end if;
end $$;
