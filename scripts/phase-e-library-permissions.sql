-- Clone + global mutation denial smoke (rolled back).
begin;

do $$
declare
  v_admin uuid := 'e26c8f57-c0aa-4474-b43e-6e15f0260e99';
  v_user uuid := gen_random_uuid();
  v_source_id bigint;
  v_clone_id bigint;
  v_updated int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user,
    'authenticated',
    'authenticated',
    'phase-e-clone-test@example.invalid',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

  insert into public.profiles (id, email, app_role, status, onboarding_status, first_name, last_name)
  values (v_user, 'phase-e-clone-test@example.invalid', 'USER', 'ACTIVE', 'ACTIVE', 'Clone', 'Tester');

  select id into v_source_id
  from public.collections
  where scope = 'GLOBAL' and status = 'ACTIVE'
  order by id
  limit 1;

  if v_source_id is null then
    raise exception 'No global collection available for clone test';
  end if;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Global collection update must fail for standard user (0 rows under RLS).
  update public.collections
  set description = coalesce(description, '') || ' should-not-stick'
  where id = v_source_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL: user updated global collection (% rows)', v_updated;
  end if;

  v_clone_id := public.clone_global_collection(v_source_id);
  if v_clone_id is null then
    raise exception 'FAIL: clone returned null';
  end if;

  if not exists (
    select 1 from public.collections
    where id = v_clone_id
      and scope = 'PRIVATE'
      and owner_user_id = v_user
      and status = 'ACTIVE'
  ) then
    raise exception 'FAIL: clone ownership/scope incorrect';
  end if;

  if (
    select count(*) from public.collection_forms
    where collection_id = v_clone_id and status = 'ACTIVE'
  ) <> (
    select count(*) from public.collection_forms
    where collection_id = v_source_id and status = 'ACTIVE'
  ) then
    raise exception 'FAIL: clone form counts do not match source';
  end if;

  -- Global form update denied
  update public.forms
  set form_name = form_name || ' x'
  where scope = 'GLOBAL' and status = 'ACTIVE';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL: user updated global forms (% rows)', v_updated;
  end if;

  raise notice 'PASS clone_id=% source=%', v_clone_id, v_source_id;
end $$;

rollback;
