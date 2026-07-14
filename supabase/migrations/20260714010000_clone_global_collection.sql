-- Phase E: atomic clone of a GLOBAL collection into a PRIVATE owner copy.
-- Does not weaken Phase C RLS. Owner always comes from auth.uid().

create or replace function public.clone_global_collection(
  p_source_collection_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.collections%rowtype;
  v_new_id bigint;
  v_base_name text;
  v_name text;
  v_suffix integer := 1;
  v_form record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_source
  from public.collections
  where id = p_source_collection_id
  for share;

  if not found then
    raise exception 'Collection not found.';
  end if;

  if v_source.status <> 'ACTIVE' then
    raise exception 'Only active collections can be cloned.';
  end if;

  if v_source.scope <> 'GLOBAL' then
    raise exception 'Only global collections can be cloned.';
  end if;

  for v_form in
    select f.id, f.scope, f.owner_user_id, f.status
    from public.collection_forms cf
    join public.forms f on f.id = cf.form_id
    where cf.collection_id = v_source.id
      and cf.status = 'ACTIVE'
  loop
    if v_form.status <> 'ACTIVE' then
      raise exception 'Collection includes an inactive form and cannot be cloned.';
    end if;
    if v_form.scope = 'GLOBAL' then
      continue;
    end if;
    if v_form.scope = 'PRIVATE' and v_form.owner_user_id = v_uid then
      continue;
    end if;
    raise exception 'Collection includes a form you cannot access.';
  end loop;

  v_base_name := trim(v_source.collection_name) || ' - Copy';
  v_name := v_base_name;

  while exists (
    select 1
    from public.collections c
    where c.owner_user_id = v_uid
      and c.status = 'ACTIVE'
      and lower(c.collection_name) = lower(v_name)
  ) loop
    v_suffix := v_suffix + 1;
    v_name := v_base_name || ' ' || v_suffix::text;
  end loop;

  insert into public.collections (
    collection_name,
    collection_type,
    description,
    status,
    scope,
    owner_user_id,
    organization_id
  )
  values (
    v_name,
    v_source.collection_type,
    v_source.description,
    'ACTIVE',
    'PRIVATE',
    v_uid,
    null
  )
  returning id into v_new_id;

  insert into public.collection_forms (
    collection_id,
    form_id,
    sort_order,
    is_required,
    status
  )
  select
    v_new_id,
    cf.form_id,
    cf.sort_order,
    cf.is_required,
    'ACTIVE'
  from public.collection_forms cf
  where cf.collection_id = v_source.id
    and cf.status = 'ACTIVE'
  order by cf.sort_order, cf.id;

  return v_new_id;
end;
$$;

revoke all on function public.clone_global_collection(bigint) from public;
grant execute on function public.clone_global_collection(bigint) to authenticated;
