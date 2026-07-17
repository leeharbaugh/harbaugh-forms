-- Evidence-based repair of 11 field_instances overwritten on 2026-07-17 when
-- Global catalog preference literals were cleared and existing packet forms were
-- re-opened under the former open-time re-resolution path.
--
-- Scope: only the 11 previously confirmed historical overwrites.
-- Does not touch at-risk instances, post-clear newly empty inserts, Global
-- catalog fields, field_defaults, mappings, coordinates, or transaction details.
--
-- Protection: restored rows are set is_override = true with source
-- manual_override so ordinary open (ensure_missing) and explicit Refresh Values
-- (refresh_non_overrides) leave them unchanged.
--
-- Evidence (no PII): unaffected sibling instances retaining the former
-- catalog-derived value/source, known former Global catalog literals, and the
-- exact destructive UPDATE_DATE pattern from the incident. Packet-form 28
-- generated-document object predates the catalog clear (supporting artifact
-- existence only; filled text not reliably extractable from the flattened PDF).

begin;

create temporary table _incident_repair_20260717 (
  instance_id uuid primary key,
  packet_form_id bigint not null,
  field_id uuid not null,
  expected_update_date timestamptz not null,
  restore_value text not null
) on commit drop;

insert into _incident_repair_20260717 (
  instance_id,
  packet_form_id,
  field_id,
  expected_update_date,
  restore_value
) values
  -- Packet form 28 (seven listing fields)
  (
    'd0dba3e6-4a38-43a2-9180-e16dce446a3f',
    28,
    '4861d3dd-ad35-4a65-827b-a6266486f7da',
    '2026-07-17T19:03:51.224181+00:00',
    'NA'
  ),
  (
    'f2f898b7-6f37-4014-87fc-fc26af748c9d',
    28,
    '54300c4c-ffed-4dce-9fb0-e43ec9869e6a',
    '2026-07-17T19:03:51.490376+00:00',
    'NA'
  ),
  (
    'c798a710-ad4d-432c-a87c-ab6905be6bd3',
    28,
    '062cc399-475f-471e-a23e-cc4156c7a531',
    '2026-07-17T19:03:53.230905+00:00',
    'NA'
  ),
  (
    'fecbbdff-b644-4674-aeb8-28a148853f5e',
    28,
    '998b7869-bc45-4686-a75c-e60cd3581b78',
    '2026-07-17T19:03:53.337947+00:00',
    'NA'
  ),
  (
    'e4096ef1-b2f5-4bd2-bbcf-380351ebda38',
    28,
    'b08bb4a1-95ec-4824-92cc-36a3a0601e90',
    '2026-07-17T19:03:53.447544+00:00',
    'NA'
  ),
  (
    'c05a4dec-3431-4f65-a5a8-8b4d000096fa',
    28,
    'b4fa63a8-2107-4fda-b5ec-c06ba3e85884',
    '2026-07-17T19:03:53.570423+00:00',
    'NA'
  ),
  (
    'b39a3d91-e473-45b2-bfa9-238c2ed655bc',
    28,
    'ef9b7bc7-b878-49f6-8e92-c294dd733089',
    '2026-07-17T19:03:54.027528+00:00',
    'NA'
  ),
  -- Packet form 61 (four contract fields)
  (
    '735a2620-a371-44ca-bc2b-4b29e80a674b',
    61,
    '75358af0-183c-47d4-9bcb-87e8691b4e66',
    '2026-07-17T18:53:04.231776+00:00',
    'NA'
  ),
  (
    '0c6f16fd-d37d-43f0-8b84-79beee02569a',
    61,
    '92b8cdbd-479b-44ea-8bfd-1a98d823429d',
    '2026-07-17T18:53:04.356531+00:00',
    '0'
  ),
  (
    'af5f0659-1c52-43b3-9b7a-5a3af628e5cc',
    61,
    'b00cae55-3d09-49f4-a31b-df49b481b886',
    '2026-07-17T18:53:04.45924+00:00',
    'NA'
  ),
  (
    '5ba76cba-abd1-4ad3-b6a9-ac38d3b9cb34',
    61,
    'da9e14f5-6f26-4d0a-9f13-7e8097fed433',
    '2026-07-17T18:53:04.559719+00:00',
    'NA'
  );

do $$
declare
  v_matched integer;
  v_updated integer;
begin
  select count(*)::integer
  into v_matched
  from public.field_instances fi
  join _incident_repair_20260717 r on r.instance_id = fi.id
  where fi.status = 'ACTIVE'
    and fi.packet_form_id = r.packet_form_id
    and fi.field_id = r.field_id
    and fi.is_override = false
    and fi.source = 'empty'
    and fi.update_date = r.expected_update_date
    and (fi.value is null or btrim(fi.value) = '')
    and fi.value_json is null;

  raise notice 'incident_repair_20260717 matched_preconditions=%', v_matched;

  update public.field_instances fi
  set
    value = r.restore_value,
    value_json = null,
    source = 'manual_override',
    is_override = true,
    notes = coalesce(
      nullif(btrim(fi.notes), ''),
      'Restored after 2026-07-17 catalog-clear open-time overwrite; evidence-based historical packet value.'
    ),
    update_date = now()
  from _incident_repair_20260717 r
  where fi.id = r.instance_id
    and fi.status = 'ACTIVE'
    and fi.packet_form_id = r.packet_form_id
    and fi.field_id = r.field_id
    and fi.is_override = false
    and fi.source = 'empty'
    and fi.update_date = r.expected_update_date
    and (fi.value is null or btrim(fi.value) = '')
    and fi.value_json is null;

  get diagnostics v_updated = row_count;
  raise notice 'incident_repair_20260717 rows_updated=%', v_updated;

  if v_updated <> v_matched then
    raise exception
      'incident_repair_20260717 update/match mismatch: matched=% updated=%',
      v_matched,
      v_updated;
  end if;

  if v_updated not in (0, 11) then
    raise exception
      'incident_repair_20260717 unexpected update count=% (expected 0 or 11)',
      v_updated;
  end if;
end $$;

commit;
