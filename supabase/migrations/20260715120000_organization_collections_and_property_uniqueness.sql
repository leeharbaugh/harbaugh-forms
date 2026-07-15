-- Organization-scoped collections + owner-scoped property address uniqueness.
-- Additive. Does not weaken RLS. Does not hard-delete records.

begin;

-- ---------------------------------------------------------------------------
-- 1. Organization role helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_active_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
      and om.membership_role = 'ORG_ADMIN'
  );
$$;

revoke all on function public.is_active_organization_admin(uuid) from public;
grant execute on function public.is_active_organization_admin(uuid) to authenticated;

comment on function public.is_active_organization_admin(uuid) is
  'True when auth.uid() is an ACTIVE ORG_ADMIN of the organization.';

-- ---------------------------------------------------------------------------
-- 2. Collection read/mutate helpers (ORGANIZATION membership aware)
-- ---------------------------------------------------------------------------

create or replace function public.can_read_collection(p_collection_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.collections c
      where c.id = p_collection_id
        and (
          (c.scope = 'GLOBAL' and c.status = 'ACTIVE')
          or (c.scope = 'PRIVATE' and c.owner_user_id = auth.uid())
          or (
            c.scope = 'ORGANIZATION'
            and c.organization_id is not null
            and public.is_active_organization_member(c.organization_id)
          )
        )
    );
$$;

create or replace function public.can_mutate_collection(p_collection_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.collections c
      where c.id = p_collection_id
        and (
          (c.scope = 'PRIVATE' and c.owner_user_id = auth.uid())
          or (
            c.scope = 'ORGANIZATION'
            and c.organization_id is not null
            and public.is_active_organization_admin(c.organization_id)
          )
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Collections RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists "collections_select" on public.collections;
drop policy if exists "collections_insert" on public.collections;
drop policy if exists "collections_update" on public.collections;

create policy "collections_select"
  on public.collections
  for select
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'GLOBAL' and status = 'ACTIVE')
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and public.is_active_organization_member(organization_id)
    )
  );

create policy "collections_insert"
  on public.collections
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and owner_user_id is null
      and public.is_active_organization_admin(organization_id)
    )
  );

create policy "collections_update"
  on public.collections
  for update
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and public.is_active_organization_admin(organization_id)
    )
  )
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
    or (
      scope = 'ORGANIZATION'
      and organization_id is not null
      and owner_user_id is null
      and public.is_active_organization_admin(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Ownership trigger: ORG_ADMIN may create ORGANIZATION collections
-- ---------------------------------------------------------------------------

create or replace function public.set_scoped_library_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope is null then
    new.scope := 'PRIVATE';
  end if;

  -- Trusted server / service-role path (no JWT): honor explicit scope.
  if auth.uid() is null then
    if new.scope = 'GLOBAL' then
      new.owner_user_id := null;
      new.organization_id := null;
    elsif new.scope = 'PRIVATE' then
      new.organization_id := null;
    elsif new.scope = 'ORGANIZATION' then
      new.owner_user_id := null;
    end if;
    return new;
  end if;

  -- Authenticated path.
  -- GLOBAL: app admin only (forms remain GLOBAL-capable; collections UI does not create GLOBAL).
  if new.scope = 'GLOBAL' and not public.is_app_admin() then
    new.scope := 'PRIVATE';
  end if;

  -- ORGANIZATION: app admin or active ORG_ADMIN of the target organization.
  if new.scope = 'ORGANIZATION' then
    if public.is_app_admin() then
      null;
    elsif new.organization_id is not null
      and public.is_active_organization_admin(new.organization_id) then
      null;
    else
      new.scope := 'PRIVATE';
      new.organization_id := null;
    end if;
  end if;

  if new.scope = 'GLOBAL' then
    new.owner_user_id := null;
    new.organization_id := null;
  elsif new.scope = 'PRIVATE' then
    new.organization_id := null;
    if public.is_app_admin() then
      if new.owner_user_id is null then
        new.owner_user_id := auth.uid();
      end if;
    else
      new.owner_user_id := auth.uid();
    end if;
  elsif new.scope = 'ORGANIZATION' then
    new.owner_user_id := null;
  end if;

  if tg_op = 'UPDATE'
     and not public.is_app_admin()
     and not (
       -- ORG_ADMIN may update organization collections for their org but may not
       -- reassign scope/org ownership away from their admin org.
       old.scope = 'ORGANIZATION'
       and new.scope = 'ORGANIZATION'
       and old.organization_id is not distinct from new.organization_id
       and public.is_active_organization_admin(old.organization_id)
     )
     and (
       new.scope is distinct from old.scope
       or new.owner_user_id is distinct from old.owner_user_id
       or new.organization_id is distinct from old.organization_id
     ) then
    new.scope := old.scope;
    new.owner_user_id := old.owner_user_id;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;

comment on function public.set_scoped_library_ownership() is
  'Assign scope/owner for forms, collections, and fields. '
  'Standard users are forced to PRIVATE + auth.uid() except ORG_ADMIN '
  'may create/maintain ORGANIZATION collections for their organization. '
  'App admins may create GLOBAL/ORGANIZATION. '
  'Service-role (auth.uid() null) may set explicit valid scope combinations.';

-- ---------------------------------------------------------------------------
-- 5. Migrate four Davey Goosmann shared collections GLOBAL → ORGANIZATION
-- Verified live: org b788f525-53f4-42ed-b5a1-cb741398a974 = Davey Goosmann Realty
-- Collections 1,2,3,5 = Buyer Rep / Sales Listing / Contract Offer / Lease Listing
-- ---------------------------------------------------------------------------

do $$
declare
  v_org_id uuid := 'b788f525-53f4-42ed-b5a1-cb741398a974';
  v_org_name text;
  v_count integer;
begin
  select name into v_org_name
  from public.organizations
  where id = v_org_id;

  if v_org_name is distinct from 'Davey Goosmann Realty' then
    raise exception
      'Organization id % does not match Davey Goosmann Realty (found %)',
      v_org_id,
      coalesce(v_org_name, '<missing>');
  end if;

  update public.collections
  set
    scope = 'ORGANIZATION',
    organization_id = v_org_id,
    owner_user_id = null
  where id in (1, 2, 3, 5)
    and scope = 'GLOBAL';

  get diagnostics v_count = row_count;
  if v_count <> 4 then
    raise exception
      'Expected to migrate 4 GLOBAL collections (1,2,3,5); updated %',
      v_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Clone RPC: organization (and legacy global) → private
-- ---------------------------------------------------------------------------

create or replace function public.clone_library_collection(
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

  if v_source.scope = 'PRIVATE' then
    raise exception 'Private collections cannot be cloned via this action.';
  end if;

  if v_source.scope = 'GLOBAL' then
    null; -- legacy compatibility; new creation should not produce GLOBAL collections
  elsif v_source.scope = 'ORGANIZATION' then
    if v_source.organization_id is null
       or not public.is_active_organization_member(v_source.organization_id) then
      raise exception 'You do not have access to this organization collection.';
    end if;
  else
    raise exception 'Unsupported collection scope for cloning.';
  end if;

  -- Caller must also be able to read the source under RLS helpers.
  if not public.can_read_collection(v_source.id) then
    raise exception 'You do not have access to this collection.';
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

revoke all on function public.clone_library_collection(bigint) from public;
grant execute on function public.clone_library_collection(bigint) to authenticated;

-- Keep legacy name as a thin wrapper for existing clients.
create or replace function public.clone_global_collection(
  p_source_collection_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.clone_library_collection(p_source_collection_id);
end;
$$;

comment on function public.clone_library_collection(bigint) is
  'Clone an ORGANIZATION (or legacy GLOBAL) collection into a PRIVATE copy for auth.uid().';

comment on function public.clone_global_collection(bigint) is
  'Compatibility wrapper for clone_library_collection.';

-- ---------------------------------------------------------------------------
-- 7. Property address normalization (DB authority for uniqueness)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_property_street(p_street text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  v_parts text[];
  v_last text;
  v_map jsonb := '{
    "court":"ct","courts":"ct",
    "street":"st","streets":"st",
    "avenue":"ave","avenues":"ave",
    "drive":"dr",
    "road":"rd",
    "boulevard":"blvd",
    "lane":"ln",
    "place":"pl",
    "circle":"cir",
    "trail":"trl",
    "parkway":"pkwy",
    "highway":"hwy",
    "terrace":"ter"
  }'::jsonb;
begin
  v := lower(coalesce(p_street, ''));
  v := regexp_replace(v, '[[:punct:]]+', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := trim(v);
  if v = '' then
    return '';
  end if;

  v_parts := regexp_split_to_array(v, ' ');
  v_last := v_parts[array_length(v_parts, 1)];
  if v_map ? v_last then
    v_parts[array_length(v_parts, 1)] := v_map ->> v_last;
  end if;

  return array_to_string(v_parts, ' ');
end;
$$;

create or replace function public.normalize_property_unit(p_unit text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(regexp_replace(coalesce(p_unit, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.normalize_property_city(p_city text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.normalize_property_state(p_state text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when upper(trim(coalesce(p_state, ''))) in ('TEXAS', 'TX') then 'TX'
    else upper(trim(coalesce(p_state, '')))
  end;
$$;

create or replace function public.normalize_property_zip5(p_zip text)
returns text
language sql
immutable
set search_path = public
as $$
  select left(regexp_replace(coalesce(p_zip, ''), '\D', '', 'g'), 5);
$$;

revoke all on function public.normalize_property_street(text) from public;
revoke all on function public.normalize_property_unit(text) from public;
revoke all on function public.normalize_property_city(text) from public;
revoke all on function public.normalize_property_state(text) from public;
revoke all on function public.normalize_property_zip5(text) from public;

grant execute on function public.normalize_property_street(text) to authenticated;
grant execute on function public.normalize_property_unit(text) to authenticated;
grant execute on function public.normalize_property_city(text) to authenticated;
grant execute on function public.normalize_property_state(text) to authenticated;
grant execute on function public.normalize_property_zip5(text) to authenticated;

-- Chatsworth reconciliation note (live discovery 2026-07-15):
-- owner e26c8f57 already has ACTIVE #7 "5801 Chatsworth Court" (complete)
-- and DELETED #8 "5801 Chatsworth Ct." (empty). No FK reassignment needed.
-- owner 8d10af59 has independent ACTIVE #10 "5801 Chatsworth Court" (allowed).
-- After street-suffix normalization, no same-owner non-deleted collisions remain.

drop index if exists public.properties_owner_address_active_uidx;

create unique index properties_owner_address_live_uidx
  on public.properties (
    owner_user_id,
    (public.normalize_property_street(street_address)),
    (public.normalize_property_unit(unit)),
    (public.normalize_property_city(city)),
    (public.normalize_property_state(state)),
    (public.normalize_property_zip5(zip))
  )
  where status <> 'DELETED'
    and owner_user_id is not null;

comment on index public.properties_owner_address_live_uidx is
  'One non-deleted property per owner per normalized address (street/unit/city/state/ZIP5).';

-- ---------------------------------------------------------------------------
-- 8. Block new GLOBAL collections (forms may still use GLOBAL)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_collection_non_global_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scope = 'GLOBAL' then
    raise exception
      'Collections cannot use GLOBAL scope. Use ORGANIZATION or PRIVATE.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_collections_non_global_scope on public.collections;
create trigger trg_collections_non_global_scope
  before insert or update of scope
  on public.collections
  for each row
  execute function public.enforce_collection_non_global_scope();

comment on function public.enforce_collection_non_global_scope() is
  'Reject GLOBAL scope for collections; organization and private only.';

commit;
