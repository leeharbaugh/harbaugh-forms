-- Phase C RLS policy tests (transactional; always ROLLBACK).

begin;

create temporary table phase_c_test_results (
  test_name text primary key,
  ok boolean not null,
  detail text
) on commit drop;

do $$
declare
  v_admin uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99';
  v_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_contact_a bigint;
  v_contact_b bigint;
  v_packet_a bigint;
  v_form_private_a bigint;
  v_collection_id bigint;
  v_cnt int;
  v_ok boolean;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
    (
      '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
      'phase-c-a@example.com', crypt('test-password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
      'phase-c-b@example.com', crypt('test-password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, preferred_name, display_name, app_role, status)
  values
    (v_a, 'phase-c-a@example.com', 'A', 'User A', 'USER', 'ACTIVE'),
    (v_b, 'phase-c-b@example.com', 'B', 'User B', 'USER', 'ACTIVE')
  on conflict (id) do update
    set status = 'ACTIVE', app_role = excluded.app_role;

  insert into public.contacts (first_name, last_name, owner_user_id, status)
  values ('Alice', 'OwnerA', v_a, 'ACTIVE')
  returning id into v_contact_a;

  insert into public.contacts (first_name, last_name, owner_user_id, status)
  values ('Bob', 'OwnerB', v_b, 'ACTIVE')
  returning id into v_contact_b;

  select id into v_collection_id
  from public.collections
  where scope = 'GLOBAL' and status = 'ACTIVE'
  order by id
  limit 1;

  insert into public.packets (
    label, packet_type, owner_user_id, status, collection_id
  ) values (
    'Phase C Packet A', 'buyer_rep', v_a, 'ACTIVE', v_collection_id
  ) returning id into v_packet_a;

  insert into public.forms (
    form_name, form_code, form_category, source_storage_path,
    scope, owner_user_id, status
  ) values (
    'Phase C Private Form A',
    'PHASE-C-A',
    'OTHER',
    'users/' || v_a::text || '/forms/999999/phase-c-a.pdf',
    'PRIVATE',
    v_a,
    'ACTIVE'
  ) returning id into v_form_private_a;

  -- ----- User A -----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text,
    true
  );

  v_ok := not public.is_app_admin();
  reset role;
  insert into phase_c_test_results values ('user_a_is_not_admin', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := exists(select 1 from public.contacts where id = v_contact_a);
  reset role;
  insert into phase_c_test_results values ('user_a_reads_own_contact', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := not exists(select 1 from public.contacts where id = v_contact_b);
  reset role;
  insert into phase_c_test_results values ('user_a_denied_user_b_contact', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := (select count(*) >= 18 from public.forms where scope = 'GLOBAL' and status = 'ACTIVE');
  reset role;
  insert into phase_c_test_results values ('user_a_reads_global_forms', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := exists(select 1 from public.forms where id = v_form_private_a);
  reset role;
  insert into phase_c_test_results values ('user_a_reads_own_private_form', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := exists(select 1 from public.packets where id = v_packet_a);
  reset role;
  insert into phase_c_test_results values ('user_a_reads_own_packet', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  update public.forms set form_name = form_name where scope = 'GLOBAL' and status = 'ACTIVE';
  get diagnostics v_cnt = row_count;
  reset role;
  insert into phase_c_test_results values ('user_a_cannot_update_global_form', v_cnt = 0, 'updated=' || v_cnt::text);

  -- ----- User B -----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  v_ok := not exists(select 1 from public.forms where id = v_form_private_a);
  reset role;
  insert into phase_c_test_results values ('user_b_denied_user_a_private_form', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  v_ok := not exists(select 1 from public.packets where id = v_packet_a);
  reset role;
  insert into phase_c_test_results values ('user_b_denied_user_a_packet', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  v_ok := not exists(select 1 from public.contacts where id = v_contact_a);
  reset role;
  insert into phase_c_test_results values ('user_b_denied_user_a_contact', v_ok, '');

  -- ----- Admin -----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_ok := public.is_app_admin();
  reset role;
  insert into phase_c_test_results values ('admin_is_app_admin', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_ok := exists(select 1 from public.contacts where id = v_contact_a)
      and exists(select 1 from public.contacts where id = v_contact_b);
  reset role;
  insert into phase_c_test_results values ('admin_reads_both_contacts', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_ok := exists(select 1 from public.forms where id = v_form_private_a);
  reset role;
  insert into phase_c_test_results values ('admin_reads_private_form_a', v_ok, '');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_ok := (select count(*) >= 4 from public.collections where scope = 'GLOBAL' and status = 'ACTIVE');
  reset role;
  insert into phase_c_test_results values ('admin_reads_global_collections', v_ok, '');

  -- Storage helpers under User A JWT
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  v_ok := public.storage_is_own_user_path('users/' || v_a::text || '/packets/1/2-x.pdf')
      and not public.storage_is_own_user_path('users/' || v_b::text || '/packets/1/2-x.pdf')
      and public.storage_is_global_form_path('global/forms/1/BuyerRep.pdf')
      and public.storage_is_legacy_form_path('TXR-1501/BuyerRep.pdf');
  reset role;
  insert into phase_c_test_results values ('storage_path_helpers', v_ok, '');
end $$;

select test_name, ok, detail from phase_c_test_results order by test_name;

do $$
begin
  if exists (select 1 from phase_c_test_results where not ok) then
    raise exception 'Phase C RLS tests failed: %',
      (select string_agg(test_name, ', ') from phase_c_test_results where not ok);
  end if;
end $$;

rollback;
