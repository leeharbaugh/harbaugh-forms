-- Remove unused source registry metadata (packet / static_default source types)
-- and normalize unreachable Listing/Lease custom_resolver catalog fields.
-- Forward-only. No CASCADE. Does not modify packet field instances or defaults.

do $$
declare
  v_dead_custom_resolver uuid[] := array[
    'f8772cac-54e9-4853-b7c0-20d86434b332'::uuid,
    '34c3d4b6-079e-457c-8118-69f6b40f6b9b'::uuid,
    'eaae334b-8d18-4b44-aaaf-73ee4e6c507c'::uuid,
    '5bbf798f-9d5a-44a4-9aa7-0a6ea33c5bd0'::uuid,
    '29141220-19d5-433f-883a-abfdf8d787c9'::uuid,
    '0325154f-411d-434b-af37-1ee80cd53b1f'::uuid,
    '19ba5699-8cab-429a-ab7c-a9e4e4ec2856'::uuid,
    '81916754-54fb-450a-8da9-ae33d382ff8f'::uuid,
    '7a472bb1-abb5-47b7-a527-294e5b5688e1'::uuid,
    'd75bea67-aafd-41d1-a199-d58e41c123ab'::uuid,
    '0adad259-ceed-4473-b4d2-47286b2c8dc5'::uuid,
    'e705f9a5-cfa0-4fc8-bcac-2bc5a2d1ca5e'::uuid,
    '443943cf-952f-44a0-bbb9-3dfb1c1be49e'::uuid,
    '9e90a258-9ef7-42e1-a6ab-0711767fcc90'::uuid,
    '1dd783c8-2768-435e-ab80-b7f7a56ffea1'::uuid,
    'b9510242-b0e3-4bb3-831f-19f9fd0b9930'::uuid,
    'ef8a543e-e67e-4969-95bf-9df7237e5240'::uuid,
    'a03de7f8-f01b-4e89-b9ae-3fbc6c3266a4'::uuid,
    '8b50ca83-a96e-4442-bf14-0a5e98ad0c17'::uuid,
    'd22ccd04-7ca5-42b3-a78d-5f39c9057e08'::uuid,
    'a08396db-07e8-4530-9004-fbcbf22ab18c'::uuid,
    'a5b6a0a8-742a-41da-bbe0-9dd9c1b67dab'::uuid,
    '503cba15-0ebe-44bd-8930-1903e6391d1f'::uuid,
    '520b9560-8d85-4b60-98d6-fb51e57f0a5a'::uuid,
    '66a333e7-141f-4bd4-b1d4-09cc98e787a7'::uuid,
    '8f05a14b-987c-4676-9445-85bc2d46ce46'::uuid,
    'b32cc3d8-3c5b-44ff-94b7-f93421d04714'::uuid,
    '423a46ba-dd6c-4c72-80b6-9a9d02e102d6'::uuid,
    'f7698db2-eec3-4524-9a08-45d2a48d50c0'::uuid,
    'e9bab993-e068-49c9-bb94-fff9d960fedc'::uuid,
    'a99e6f92-9a89-42ad-8cb0-f0af5fa46c52'::uuid,
    'de6a83d3-c741-472a-b8de-9792af30d9b9'::uuid,
    'bcd40956-2741-4034-a75d-dccb5a667ac7'::uuid,
    '5bf1a2b5-5895-4ed3-8c45-2a01492ccc8a'::uuid,
    '01994cf2-7155-488d-bfbd-dfedc1205011'::uuid,
    'a86558af-500b-444f-84f4-c6996607dc26'::uuid,
    '9168a44c-c67c-4433-acbe-6cdf1962d5d8'::uuid,
    '61defa71-372d-45ec-8635-51a7c88a3f22'::uuid,
    '50d1fa9a-7e0c-4ad0-b563-73faf79e5859'::uuid,
    '4d5fe84d-93c9-4e79-b17f-01dc1d813b03'::uuid,
    'ad2fa315-15bb-46f2-ab5a-0293aea21e29'::uuid,
    'cfb7f9b4-0095-4e39-85b3-593715922486'::uuid,
    '731ea151-77d8-429a-9ca7-99d7d318f37c'::uuid,
    '09134ee6-6927-492b-9600-11c876db364b'::uuid,
    '6b65f1b8-8760-4b12-91e1-29f5fc4ea468'::uuid,
    '31c5ee23-9ef0-487a-8ac2-ecda5bfda64b'::uuid,
    '09fa7f77-4271-4c66-aae4-5ad47a27592a'::uuid,
    'bbc04795-ad10-4d12-ba4b-4adf6e2eebcf'::uuid,
    '7f702a06-6e6a-47f9-aa0c-348c05e8862c'::uuid,
    'b1fe245b-392a-4602-972e-00a3e1c375de'::uuid,
    'c212f8d3-fe1f-49cb-b50d-7ca25d285c54'::uuid,
    'c7caa01e-3e92-446b-9d82-e1a9be0fb801'::uuid,
    'e8adaba4-753c-4e33-81a8-9ef9b5dc2a23'::uuid
  ];
  v_property_address uuid := '27e50ce0-130e-4640-89d1-0e468e18434e'::uuid;
  v_count integer;
  v_contract_resolver_ids uuid[];
begin
  -- -----------------------------------------------------------------------
  -- Preconditions
  -- -----------------------------------------------------------------------
  select count(*)::int into v_count
  from public.fields
  where source_type in ('packet', 'static_default');

  if v_count <> 0 then
    raise exception
      'remove_unused_source_registry_metadata refused: % field(s) still use packet or static_default',
      v_count;
  end if;

  select count(*)::int into v_count
  from public.fields
  where id = any (v_dead_custom_resolver)
    and status = 'ACTIVE'
    and source_type = 'custom_resolver';

  if v_count not in (0, cardinality(v_dead_custom_resolver)) then
    raise exception
      'remove_unused_source_registry_metadata refused: partial dead custom_resolver cohort (% of %)',
      v_count,
      cardinality(v_dead_custom_resolver);
  end if;

  -- -----------------------------------------------------------------------
  -- S4: convert unreachable Listing/Lease custom_resolver fields
  -- -----------------------------------------------------------------------
  if v_count = cardinality(v_dead_custom_resolver) then
    update public.fields
    set
      source_type = 'manual_only',
      source_path = null,
      resolver_key = null,
      update_date = timezone('utc', now())
    where id = any (v_dead_custom_resolver)
      and status = 'ACTIVE'
      and source_type = 'custom_resolver';
  end if;

  -- -----------------------------------------------------------------------
  -- S4: repair PROPERTY_ADDRESS path (rerun-safe)
  -- -----------------------------------------------------------------------
  update public.fields
  set
    source_path = 'full_address',
    resolver_key = null,
    update_date = timezone('utc', now())
  where id = v_property_address
    and status = 'ACTIVE'
    and source_type = 'packet_property'
    and (
      source_path is null
      or resolver_key = 'property_full_address'
    );

  select count(*)::int into v_count
  from public.fields
  where id = v_property_address
    and source_type = 'packet_property'
    and source_path = 'full_address'
    and resolver_key is null;

  if v_count <> 1 then
    raise exception
      'remove_unused_source_registry_metadata failed: PROPERTY_ADDRESS postcondition failed';
  end if;

  -- -----------------------------------------------------------------------
  -- Soft-delete orphan contract_* field_resolvers catalog rows
  -- -----------------------------------------------------------------------
  select coalesce(array_agg(id), array[]::uuid[])
  into v_contract_resolver_ids
  from public.field_resolvers
  where resolver_key like 'contract_%';

  update public.fields
  set
    field_resolver_id = null,
    update_date = timezone('utc', now())
  where field_resolver_id = any (v_contract_resolver_ids);

  update public.field_resolvers
  set
    status = 'DELETED',
    update_date = timezone('utc', now())
  where id = any (v_contract_resolver_ids)
    and status is distinct from 'DELETED';

  -- -----------------------------------------------------------------------
  -- Shrink fields_source_type_check (remove packet + static_default)
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
          'buyer_rep_details'::text,
          'representation_agreement'::text,
          'custom_resolver'::text,
          'manual_only'::text,
          'packet_instance'::text
        ]
      )
    );

  -- -----------------------------------------------------------------------
  -- Postconditions
  -- -----------------------------------------------------------------------
  select count(*)::int into v_count
  from public.fields
  where source_type in ('packet', 'static_default');

  if v_count <> 0 then
    raise exception
      'remove_unused_source_registry_metadata postcondition failed: packet/static_default still present';
  end if;

  select count(*)::int into v_count
  from public.fields
  where id = any (v_dead_custom_resolver)
    and (
      source_type is distinct from 'manual_only'
      or source_path is not null
      or resolver_key is not null
    );

  if v_count <> 0 then
    raise exception
      'remove_unused_source_registry_metadata postcondition failed: % converted fields not manual_only',
      v_count;
  end if;

  select count(*)::int into v_count
  from public.field_resolvers
  where resolver_key like 'contract_%'
    and status is distinct from 'DELETED';

  if v_count <> 0 then
    raise exception
      'remove_unused_source_registry_metadata postcondition failed: contract field_resolvers not DELETED';
  end if;
end;
$$;
