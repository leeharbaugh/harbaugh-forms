-- Remove obsolete Listing Agreement details workflow.
--
-- Lee confirmed (2026-07-22):
--   * listing_agreement_details row id=1 is disposable development data
--     (no export / no archive);
--   * Listing representation_agreements id=2 and its Listing-only client
--     links are removable after dependency checks;
--   * drop public.listing_agreement_details and related source support;
--   * preserve Buyer Rep architecture and collection-based Listing packets.
--
-- Soft-delete policy:
--   representation_agreements and representation_agreement_clients use the
--   established soft-delete convention (status = 'DELETED').
-- Hard-delete:
--   the listing_agreement_details row is hard-deleted because the table is
--   dropped in the same migration (soft-delete would be pointless).
--
-- Historical migrations that created/expanded the table remain intact.

do $$
declare
  v_details_count integer;
  v_details_ok integer;
  v_packets_on_listing integer;
  v_client_count integer;
  v_client_ok integer;
  v_deleted_fields_pending integer;
  v_deleted_fields_converted integer;
  v_source_type_fields integer;
  v_instance_refs integer;
  v_buyer_rep_agreements integer;
  v_buyer_rep_details integer;
  v_buyer_rep_clients integer;
  v_missing text;
begin
  -- -----------------------------------------------------------------------
  -- Idempotent path: table already dropped
  -- -----------------------------------------------------------------------
  if to_regclass('public.listing_agreement_details') is null then
    if exists (
      select 1 from public.fields where source_type = 'listing_agreement_details'
    ) then
      raise exception
        'remove_listing_legacy_workflow: table already dropped but fields still use source_type = listing_agreement_details';
    end if;

    if exists (
      select 1
      from pg_constraint
      where conname = 'fields_source_type_check'
        and pg_get_constraintdef(oid) like '%listing_agreement_details%'
    ) then
      alter table public.fields drop constraint fields_source_type_check;
      alter table public.fields
        add constraint fields_source_type_check
        check (
          source_type is null
          or source_type = any (
            array[
              'settings_agent'::text,
              'settings_brokerage'::text,
              'packet_contact'::text,
              'packet_property'::text,
              'packet'::text,
              'buyer_rep_details'::text,
              'representation_agreement'::text,
              'static_default'::text,
              'custom_resolver'::text,
              'manual_only'::text,
              'packet_instance'::text
            ]
          )
        );
    end if;

    return;
  end if;

  -- -----------------------------------------------------------------------
  -- Preconditions: expected disposable Listing rows
  -- -----------------------------------------------------------------------
  select count(*)::integer into v_details_count from public.listing_agreement_details;

  if v_details_count = 0 then
    -- Details already cleared; continue toward drop if empty and safe.
    null;
  elsif v_details_count = 1 then
    select count(*)::integer into v_details_ok
    from public.listing_agreement_details d
    join public.representation_agreements r
      on r.id = d.representation_agreement_id
    where d.id = 1
      and d.representation_agreement_id = 2
      and r.id = 2
      and r.agreement_type = 'LISTING';

    if v_details_ok <> 1 then
      raise exception
        'remove_listing_legacy_workflow refused: expected details id=1 on LISTING agreement id=2; found mismatched row(s)';
    end if;
  else
    raise exception
      'remove_listing_legacy_workflow refused: listing_agreement_details has % row(s); expected 0 or 1',
      v_details_count;
  end if;

  select count(*)::integer into v_packets_on_listing
  from public.packets
  where representation_agreement_id = 2;

  if v_packets_on_listing <> 0 then
    raise exception
      'remove_listing_legacy_workflow refused: % packet(s) still reference Listing agreement id=2',
      v_packets_on_listing;
  end if;

  -- Listing-only client links (ids 3 and 4) when agreement 2 still exists.
  if exists (
    select 1 from public.representation_agreements where id = 2
  ) then
    select count(*)::integer into v_client_count
    from public.representation_agreement_clients
    where representation_agreement_id = 2
      and status <> 'DELETED';

    select count(*)::integer into v_client_ok
    from public.representation_agreement_clients
    where id in (3, 4)
      and representation_agreement_id = 2
      and status = 'ACTIVE';

    if v_client_count <> v_client_ok then
      raise exception
        'remove_listing_legacy_workflow refused: unexpected non-deleted client links on Listing agreement id=2 (count=%, expected ids 3/4 ACTIVE=% )',
        v_client_count, v_client_ok;
    end if;

    if exists (
      select 1
      from public.representation_agreements
      where id = 2
        and agreement_type is distinct from 'LISTING'
    ) then
      raise exception
        'remove_listing_legacy_workflow refused: agreement id=2 is not LISTING';
    end if;
  end if;

  if exists (
    select 1 from public.fields
    where status = 'ACTIVE' and source_type = 'listing_agreement_details'
  ) then
    raise exception
      'remove_listing_legacy_workflow refused: ACTIVE fields still use listing_agreement_details';
  end if;

  select count(*)::integer into v_instance_refs
  from public.field_instances
  where source = 'listing_agreement_details';

  if v_instance_refs <> 0 then
    raise exception
      'remove_listing_legacy_workflow refused: % field_instance(s) have source = listing_agreement_details',
      v_instance_refs;
  end if;

  -- Snapshot Buyer Rep before mutations (must remain).
  select count(*)::integer into v_buyer_rep_agreements
  from public.representation_agreements
  where agreement_type = 'BUYER_REP' and id = 1 and status = 'ACTIVE';

  select count(*)::integer into v_buyer_rep_details
  from public.buyer_rep_details
  where representation_agreement_id = 1 and status = 'ACTIVE';

  select count(*)::integer into v_buyer_rep_clients
  from public.representation_agreement_clients
  where representation_agreement_id = 1 and status = 'ACTIVE';

  if v_buyer_rep_agreements <> 1 or v_buyer_rep_details <> 1 or v_buyer_rep_clients < 1 then
    raise exception
      'remove_listing_legacy_workflow refused: unexpected Buyer Rep baseline (agreements=%, details=%, clients=%)',
      v_buyer_rep_agreements, v_buyer_rep_details, v_buyer_rep_clients;
  end if;

  -- -----------------------------------------------------------------------
  -- Normalize eight DELETED fields still typed listing_agreement_details
  -- -----------------------------------------------------------------------
  select count(*)::integer into v_deleted_fields_pending
  from public.fields
  where id = any (
      array[
        '377c4c42-432f-43fb-9aed-faaedf03d08a'::uuid,
        '9978a3ec-8dac-4c36-bd7f-2969ee442fb4'::uuid,
        'c96307ee-3fbb-4780-8dff-a56ee708ad47'::uuid,
        '799f0606-ed3f-4a5d-a111-23dc22eda8f1'::uuid,
        '1be66607-e27d-435a-b701-a5df8ad56aad'::uuid,
        '78b92ae2-361d-4767-9381-f21504b84d72'::uuid,
        '1c9cd33c-4632-474e-b39c-a7d5caac4774'::uuid,
        '24863fb8-b429-4d34-9bdf-0780a82e031b'::uuid
      ]
    )
    and status = 'DELETED'
    and source_type = 'listing_agreement_details';

  if v_deleted_fields_pending not in (0, 8) then
    raise exception
      'remove_listing_legacy_workflow refused: expected 0 or 8 DELETED listing_agreement_details fields pending conversion, found %',
      v_deleted_fields_pending;
  end if;

  update public.fields
  set source_type = 'manual_only',
      source_path = null,
      resolver_key = null
  where id = any (
      array[
        '377c4c42-432f-43fb-9aed-faaedf03d08a'::uuid,
        '9978a3ec-8dac-4c36-bd7f-2969ee442fb4'::uuid,
        'c96307ee-3fbb-4780-8dff-a56ee708ad47'::uuid,
        '799f0606-ed3f-4a5d-a111-23dc22eda8f1'::uuid,
        '1be66607-e27d-435a-b701-a5df8ad56aad'::uuid,
        '78b92ae2-361d-4767-9381-f21504b84d72'::uuid,
        '1c9cd33c-4632-474e-b39c-a7d5caac4774'::uuid,
        '24863fb8-b429-4d34-9bdf-0780a82e031b'::uuid
      ]
    )
    and status = 'DELETED'
    and source_type = 'listing_agreement_details';

  get diagnostics v_deleted_fields_converted = row_count;

  if v_deleted_fields_converted not in (0, 8) then
    raise exception
      'remove_listing_legacy_workflow DELETED-field conversion mismatch: converted=%',
      v_deleted_fields_converted;
  end if;

  if exists (
    select 1 from public.fields where source_type = 'listing_agreement_details'
  ) then
    raise exception
      'remove_listing_legacy_workflow refused: fields still use listing_agreement_details after normalization';
  end if;

  -- -----------------------------------------------------------------------
  -- Soft-delete Listing-only client links, hard-delete details row,
  -- soft-delete Listing parent agreement #2
  -- -----------------------------------------------------------------------
  update public.representation_agreement_clients
  set status = 'DELETED'
  where representation_agreement_id = 2
    and id in (3, 4)
    and status = 'ACTIVE';

  delete from public.listing_agreement_details
  where id = 1
    and representation_agreement_id = 2;

  update public.representation_agreements
  set status = 'DELETED'
  where id = 2
    and agreement_type = 'LISTING'
    and status = 'ACTIVE';

  select count(*)::integer into v_details_count from public.listing_agreement_details;
  if v_details_count <> 0 then
    raise exception
      'remove_listing_legacy_workflow refused: listing_agreement_details still has % row(s) before drop',
      v_details_count;
  end if;

  -- -----------------------------------------------------------------------
  -- Shrink fields_source_type_check (remove listing_agreement_details)
  -- -----------------------------------------------------------------------
  alter table public.fields drop constraint if exists fields_source_type_check;
  alter table public.fields
    add constraint fields_source_type_check
    check (
      source_type is null
      or source_type = any (
        array[
          'settings_agent'::text,
          'settings_brokerage'::text,
          'packet_contact'::text,
          'packet_property'::text,
          'packet'::text,
          'buyer_rep_details'::text,
          'representation_agreement'::text,
          'static_default'::text,
          'custom_resolver'::text,
          'manual_only'::text,
          'packet_instance'::text
        ]
      )
    );

  -- -----------------------------------------------------------------------
  -- Drop table-specific policies / triggers, then the table (no CASCADE)
  -- -----------------------------------------------------------------------
  drop policy if exists "listing_agreement_details_select" on public.listing_agreement_details;
  drop policy if exists "listing_agreement_details_insert" on public.listing_agreement_details;
  drop policy if exists "listing_agreement_details_update" on public.listing_agreement_details;
  drop policy if exists "listing_agreement_details_authenticated_all" on public.listing_agreement_details;

  drop trigger if exists listing_agreement_details_set_update_date on public.listing_agreement_details;
  drop trigger if exists listing_agreement_details_validate_agreement_type on public.listing_agreement_details;

  drop table public.listing_agreement_details;

  -- -----------------------------------------------------------------------
  -- Postconditions
  -- -----------------------------------------------------------------------
  if to_regclass('public.listing_agreement_details') is not null then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: listing_agreement_details still exists';
  end if;

  if exists (
    select 1 from public.fields where source_type = 'listing_agreement_details'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: fields still reference listing_agreement_details';
  end if;

  if exists (
    select 1 from public.field_instances where source = 'listing_agreement_details'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: field_instances still reference listing_agreement_details';
  end if;

  if exists (
    select 1
    from public.representation_agreements
    where id = 2 and status = 'ACTIVE'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: Listing agreement id=2 still ACTIVE';
  end if;

  if exists (
    select 1
    from public.representation_agreement_clients
    where representation_agreement_id = 2 and status = 'ACTIVE'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: ACTIVE client links remain on agreement id=2';
  end if;

  -- Buyer Rep preserved
  if not exists (
    select 1 from public.representation_agreements
    where id = 1 and agreement_type = 'BUYER_REP' and status = 'ACTIVE'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: Buyer Rep agreement id=1 missing or inactive';
  end if;

  if not exists (
    select 1 from public.buyer_rep_details
    where representation_agreement_id = 1 and status = 'ACTIVE'
  ) then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: buyer_rep_details for agreement id=1 missing';
  end if;

  if to_regprocedure('public.set_update_date()') is null then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: shared set_update_date() missing';
  end if;

  if to_regprocedure('public.validate_representation_agreement_detail()') is null then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: shared validate_representation_agreement_detail() missing';
  end if;

  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into v_missing
  from (
    values
      ('fields'),
      ('field_instances'),
      ('packets'),
      ('properties'),
      ('representation_agreements'),
      ('buyer_rep_details'),
      ('representation_agreement_clients'),
      ('property_hoas')
  ) as expected(table_name)
  where to_regclass(format('public.%I', expected.table_name)) is null;

  if v_missing is not null then
    raise exception
      'remove_listing_legacy_workflow postcondition failed: unrelated tables missing: %',
      v_missing;
  end if;
end $$;
