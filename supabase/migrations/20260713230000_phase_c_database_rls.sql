-- Phase C: database RLS cutover — replace open authenticated_*_all policies
-- with ownership-, scope-, and role-aware SELECT/INSERT/UPDATE policies.
-- Soft-delete via UPDATE only; no general authenticated DELETE policies.

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers: preserve/strengthen is_app_admin(); add ownership/scope helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
      and app_role = 'ADMIN'
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.owns_contact(p_contact_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.contacts c
      where c.id = p_contact_id
        and c.owner_user_id = auth.uid()
    );
$$;

create or replace function public.owns_property(p_property_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.properties p
      where p.id = p_property_id
        and p.owner_user_id = auth.uid()
    );
$$;

create or replace function public.owns_packet(p_packet_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.packets p
      where p.id = p_packet_id
        and p.owner_user_id = auth.uid()
    );
$$;

create or replace function public.owns_agreement(p_agreement_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.representation_agreements ra
      where ra.id = p_agreement_id
        and ra.owner_user_id = auth.uid()
    );
$$;

create or replace function public.can_read_form(p_form_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.forms f
      where f.id = p_form_id
        and (
          (f.scope = 'GLOBAL' and f.status = 'ACTIVE')
          or (f.scope = 'PRIVATE' and f.owner_user_id = auth.uid())
        )
    );
$$;

create or replace function public.can_mutate_form(p_form_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.forms f
      where f.id = p_form_id
        and f.scope = 'PRIVATE'
        and f.owner_user_id = auth.uid()
    );
$$;

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
        and c.scope = 'PRIVATE'
        and c.owner_user_id = auth.uid()
    );
$$;

create or replace function public.can_read_field(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.fields f
      where f.id = p_field_id
        and (
          (f.scope = 'GLOBAL' and f.status = 'ACTIVE')
          or (f.scope = 'PRIVATE' and f.owner_user_id = auth.uid())
        )
    );
$$;

create or replace function public.can_mutate_field(p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.fields f
      where f.id = p_field_id
        and f.scope = 'PRIVATE'
        and f.owner_user_id = auth.uid()
    );
$$;

create or replace function public.is_active_organization_member(p_organization_id uuid)
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
  );
$$;

revoke all on function public.owns_contact(bigint) from public;
revoke all on function public.owns_property(bigint) from public;
revoke all on function public.owns_packet(bigint) from public;
revoke all on function public.owns_agreement(bigint) from public;
revoke all on function public.can_read_form(bigint) from public;
revoke all on function public.can_mutate_form(bigint) from public;
revoke all on function public.can_read_collection(bigint) from public;
revoke all on function public.can_mutate_collection(bigint) from public;
revoke all on function public.can_read_field(uuid) from public;
revoke all on function public.can_mutate_field(uuid) from public;
revoke all on function public.is_active_organization_member(uuid) from public;

grant execute on function public.owns_contact(bigint) to authenticated;
grant execute on function public.owns_property(bigint) to authenticated;
grant execute on function public.owns_packet(bigint) to authenticated;
grant execute on function public.owns_agreement(bigint) to authenticated;
grant execute on function public.can_read_form(bigint) to authenticated;
grant execute on function public.can_mutate_form(bigint) to authenticated;
grant execute on function public.can_read_collection(bigint) to authenticated;
grant execute on function public.can_mutate_collection(bigint) to authenticated;
grant execute on function public.can_read_field(uuid) to authenticated;
grant execute on function public.can_mutate_field(uuid) to authenticated;
grant execute on function public.is_active_organization_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Protect profiles.app_role and profiles.status (non-admins cannot change)
-- ---------------------------------------------------------------------------

create or replace function public.profiles_protect_app_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (migrations / service role SQL): allow trusted server updates.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.app_role is distinct from 'USER' and not public.is_app_admin() then
      new.app_role := 'USER';
    end if;
    if new.status is distinct from 'ACTIVE' and not public.is_app_admin() then
      new.status := 'ACTIVE';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.app_role is distinct from old.app_role and not public.is_app_admin() then
      raise exception 'Only an application ADMIN may change profiles.app_role';
    end if;
    if new.status is distinct from old.status and not public.is_app_admin() then
      raise exception 'Only an application ADMIN may change profiles.status';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_app_role on public.profiles;
create trigger profiles_protect_app_role
before insert or update on public.profiles
for each row execute function public.profiles_protect_app_role();

-- ---------------------------------------------------------------------------
-- 3. profiles
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_authenticated_all" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_app_admin());

create policy "profiles_insert"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_app_admin())
  with check (id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 4. user_preferences (own-row retained; optional admin all)
-- ---------------------------------------------------------------------------

drop policy if exists "user_preferences_own_row" on public.user_preferences;
drop policy if exists "user_preferences_admin_all" on public.user_preferences;

create policy "user_preferences_own_row"
  on public.user_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_preferences_admin_all"
  on public.user_preferences
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 5. contacts / properties / packets / representation_agreements
-- ---------------------------------------------------------------------------

drop policy if exists "contacts_authenticated_all" on public.contacts;
drop policy if exists "clients_authenticated_all" on public.contacts;
drop policy if exists "contacts_select" on public.contacts;
drop policy if exists "contacts_insert" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;

create policy "contacts_select"
  on public.contacts
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin());

create policy "contacts_insert"
  on public.contacts
  for insert
  to authenticated
  with check (owner_user_id = auth.uid() or public.is_app_admin());

create policy "contacts_update"
  on public.contacts
  for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin())
  with check (owner_user_id = auth.uid() or public.is_app_admin());

drop policy if exists "properties_authenticated_all" on public.properties;
drop policy if exists "properties_select" on public.properties;
drop policy if exists "properties_insert" on public.properties;
drop policy if exists "properties_update" on public.properties;

create policy "properties_select"
  on public.properties
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin());

create policy "properties_insert"
  on public.properties
  for insert
  to authenticated
  with check (owner_user_id = auth.uid() or public.is_app_admin());

create policy "properties_update"
  on public.properties
  for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin())
  with check (owner_user_id = auth.uid() or public.is_app_admin());

drop policy if exists "packets_authenticated_all" on public.packets;
drop policy if exists "generated_packets_authenticated_all" on public.packets;
drop policy if exists "packets_select" on public.packets;
drop policy if exists "packets_insert" on public.packets;
drop policy if exists "packets_update" on public.packets;

create policy "packets_select"
  on public.packets
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin());

create policy "packets_insert"
  on public.packets
  for insert
  to authenticated
  with check (owner_user_id = auth.uid() or public.is_app_admin());

create policy "packets_update"
  on public.packets
  for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin())
  with check (owner_user_id = auth.uid() or public.is_app_admin());

drop policy if exists "representation_agreements_authenticated_all"
  on public.representation_agreements;
drop policy if exists "representation_agreements_select"
  on public.representation_agreements;
drop policy if exists "representation_agreements_insert"
  on public.representation_agreements;
drop policy if exists "representation_agreements_update"
  on public.representation_agreements;

create policy "representation_agreements_select"
  on public.representation_agreements
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin());

create policy "representation_agreements_insert"
  on public.representation_agreements
  for insert
  to authenticated
  with check (owner_user_id = auth.uid() or public.is_app_admin());

create policy "representation_agreements_update"
  on public.representation_agreements
  for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin())
  with check (owner_user_id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 6. Parent-owned children
-- ---------------------------------------------------------------------------

drop policy if exists "property_hoas_authenticated_all" on public.property_hoas;
drop policy if exists "property_hoas_select" on public.property_hoas;
drop policy if exists "property_hoas_insert" on public.property_hoas;
drop policy if exists "property_hoas_update" on public.property_hoas;

create policy "property_hoas_select"
  on public.property_hoas
  for select
  to authenticated
  using (public.owns_property(property_id));

create policy "property_hoas_insert"
  on public.property_hoas
  for insert
  to authenticated
  with check (public.owns_property(property_id));

create policy "property_hoas_update"
  on public.property_hoas
  for update
  to authenticated
  using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "packet_forms_authenticated_all" on public.packet_forms;
drop policy if exists "generated_documents_authenticated_all" on public.packet_forms;
drop policy if exists "packet_forms_select" on public.packet_forms;
drop policy if exists "packet_forms_insert" on public.packet_forms;
drop policy if exists "packet_forms_update" on public.packet_forms;

create policy "packet_forms_select"
  on public.packet_forms
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin());

create policy "packet_forms_insert"
  on public.packet_forms
  for insert
  to authenticated
  with check (
    public.owns_packet(packet_id)
    and (owner_user_id = auth.uid() or public.is_app_admin())
  );

create policy "packet_forms_update"
  on public.packet_forms
  for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_app_admin())
  with check (
    public.owns_packet(packet_id)
    and (owner_user_id = auth.uid() or public.is_app_admin())
  );

drop policy if exists "packet_contacts_authenticated_all" on public.packet_contacts;
drop policy if exists "packet_contacts_select" on public.packet_contacts;
drop policy if exists "packet_contacts_insert" on public.packet_contacts;
drop policy if exists "packet_contacts_update" on public.packet_contacts;

create policy "packet_contacts_select"
  on public.packet_contacts
  for select
  to authenticated
  using (
    public.owns_packet(packet_id)
    and public.owns_contact(contact_id)
  );

create policy "packet_contacts_insert"
  on public.packet_contacts
  for insert
  to authenticated
  with check (
    public.owns_packet(packet_id)
    and public.owns_contact(contact_id)
  );

create policy "packet_contacts_update"
  on public.packet_contacts
  for update
  to authenticated
  using (
    public.owns_packet(packet_id)
    and public.owns_contact(contact_id)
  )
  with check (
    public.owns_packet(packet_id)
    and public.owns_contact(contact_id)
  );

drop policy if exists "contract_details_authenticated_all" on public.contract_details;
drop policy if exists "contract_details_select" on public.contract_details;
drop policy if exists "contract_details_insert" on public.contract_details;
drop policy if exists "contract_details_update" on public.contract_details;

create policy "contract_details_select"
  on public.contract_details
  for select
  to authenticated
  using (public.owns_packet(packet_id));

create policy "contract_details_insert"
  on public.contract_details
  for insert
  to authenticated
  with check (public.owns_packet(packet_id));

create policy "contract_details_update"
  on public.contract_details
  for update
  to authenticated
  using (public.owns_packet(packet_id))
  with check (public.owns_packet(packet_id));

drop policy if exists "field_instances_authenticated_all" on public.field_instances;
drop policy if exists "field_instances_select" on public.field_instances;
drop policy if exists "field_instances_insert" on public.field_instances;
drop policy if exists "field_instances_update" on public.field_instances;

create policy "field_instances_select"
  on public.field_instances
  for select
  to authenticated
  using (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = field_instances.packet_id
    )
  );

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
    )
  )
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
    )
  );

drop policy if exists "field_instance_mappings_authenticated_all"
  on public.field_instance_mappings;
drop policy if exists "field_instance_mappings_select"
  on public.field_instance_mappings;
drop policy if exists "field_instance_mappings_insert"
  on public.field_instance_mappings;
drop policy if exists "field_instance_mappings_update"
  on public.field_instance_mappings;

create policy "field_instance_mappings_select"
  on public.field_instance_mappings
  for select
  to authenticated
  using (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = field_instance_mappings.packet_id
    )
  );

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
    )
  )
  with check (
    public.owns_packet(packet_id)
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_id
    )
  );

drop policy if exists "buyer_rep_details_authenticated_all" on public.buyer_rep_details;
drop policy if exists "buyer_rep_details_select" on public.buyer_rep_details;
drop policy if exists "buyer_rep_details_insert" on public.buyer_rep_details;
drop policy if exists "buyer_rep_details_update" on public.buyer_rep_details;

create policy "buyer_rep_details_select"
  on public.buyer_rep_details
  for select
  to authenticated
  using (public.owns_agreement(representation_agreement_id));

create policy "buyer_rep_details_insert"
  on public.buyer_rep_details
  for insert
  to authenticated
  with check (public.owns_agreement(representation_agreement_id));

create policy "buyer_rep_details_update"
  on public.buyer_rep_details
  for update
  to authenticated
  using (public.owns_agreement(representation_agreement_id))
  with check (public.owns_agreement(representation_agreement_id));

drop policy if exists "listing_agreement_details_authenticated_all"
  on public.listing_agreement_details;
drop policy if exists "listing_agreement_details_select"
  on public.listing_agreement_details;
drop policy if exists "listing_agreement_details_insert"
  on public.listing_agreement_details;
drop policy if exists "listing_agreement_details_update"
  on public.listing_agreement_details;

create policy "listing_agreement_details_select"
  on public.listing_agreement_details
  for select
  to authenticated
  using (public.owns_agreement(representation_agreement_id));

create policy "listing_agreement_details_insert"
  on public.listing_agreement_details
  for insert
  to authenticated
  with check (public.owns_agreement(representation_agreement_id));

create policy "listing_agreement_details_update"
  on public.listing_agreement_details
  for update
  to authenticated
  using (public.owns_agreement(representation_agreement_id))
  with check (public.owns_agreement(representation_agreement_id));

drop policy if exists "representation_agreement_clients_authenticated_all"
  on public.representation_agreement_clients;
drop policy if exists "representation_agreement_clients_select"
  on public.representation_agreement_clients;
drop policy if exists "representation_agreement_clients_insert"
  on public.representation_agreement_clients;
drop policy if exists "representation_agreement_clients_update"
  on public.representation_agreement_clients;

create policy "representation_agreement_clients_select"
  on public.representation_agreement_clients
  for select
  to authenticated
  using (
    public.owns_agreement(representation_agreement_id)
    and public.owns_contact(contact_id)
  );

create policy "representation_agreement_clients_insert"
  on public.representation_agreement_clients
  for insert
  to authenticated
  with check (
    public.owns_agreement(representation_agreement_id)
    and public.owns_contact(contact_id)
  );

create policy "representation_agreement_clients_update"
  on public.representation_agreement_clients
  for update
  to authenticated
  using (
    public.owns_agreement(representation_agreement_id)
    and public.owns_contact(contact_id)
  )
  with check (
    public.owns_agreement(representation_agreement_id)
    and public.owns_contact(contact_id)
  );

-- ---------------------------------------------------------------------------
-- 7. forms / fields / form_field_mappings
-- ---------------------------------------------------------------------------

drop policy if exists "forms_authenticated_all" on public.forms;
drop policy if exists "form_templates_authenticated_all" on public.forms;
drop policy if exists "forms_select" on public.forms;
drop policy if exists "forms_insert" on public.forms;
drop policy if exists "forms_update" on public.forms;

create policy "forms_select"
  on public.forms
  for select
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'GLOBAL' and status = 'ACTIVE')
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

create policy "forms_insert"
  on public.forms
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

create policy "forms_update"
  on public.forms
  for update
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  )
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

drop policy if exists "fields_authenticated_all" on public.fields;
drop policy if exists "fields_select" on public.fields;
drop policy if exists "fields_insert" on public.fields;
drop policy if exists "fields_update" on public.fields;

create policy "fields_select"
  on public.fields
  for select
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'GLOBAL' and status = 'ACTIVE')
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

create policy "fields_insert"
  on public.fields
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

create policy "fields_update"
  on public.fields
  for update
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  )
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

drop policy if exists "form_field_mappings_authenticated_all"
  on public.form_field_mappings;
drop policy if exists "form_field_mappings_select"
  on public.form_field_mappings;
drop policy if exists "form_field_mappings_insert"
  on public.form_field_mappings;
drop policy if exists "form_field_mappings_update"
  on public.form_field_mappings;

create policy "form_field_mappings_select"
  on public.form_field_mappings
  for select
  to authenticated
  using (public.can_read_form(form_id));

create policy "form_field_mappings_insert"
  on public.form_field_mappings
  for insert
  to authenticated
  with check (
    public.can_mutate_form(form_id)
    and public.can_read_field(field_id)
  );

create policy "form_field_mappings_update"
  on public.form_field_mappings
  for update
  to authenticated
  using (public.can_mutate_form(form_id))
  with check (
    public.can_mutate_form(form_id)
    and public.can_read_field(field_id)
  );

-- ---------------------------------------------------------------------------
-- 8. collections / collection_forms
-- ---------------------------------------------------------------------------

drop policy if exists "collections_authenticated_all" on public.collections;
drop policy if exists "packet_templates_authenticated_all" on public.collections;
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
  );

create policy "collections_insert"
  on public.collections
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

create policy "collections_update"
  on public.collections
  for update
  to authenticated
  using (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  )
  with check (
    public.is_app_admin()
    or (scope = 'PRIVATE' and owner_user_id = auth.uid())
  );

drop policy if exists "collection_forms_authenticated_all" on public.collection_forms;
drop policy if exists "packet_template_forms_authenticated_all"
  on public.collection_forms;
drop policy if exists "collection_forms_select" on public.collection_forms;
drop policy if exists "collection_forms_insert" on public.collection_forms;
drop policy if exists "collection_forms_update" on public.collection_forms;

create policy "collection_forms_select"
  on public.collection_forms
  for select
  to authenticated
  using (public.can_read_collection(collection_id));

create policy "collection_forms_insert"
  on public.collection_forms
  for insert
  to authenticated
  with check (
    public.can_mutate_collection(collection_id)
    and (
      public.is_app_admin()
      or exists (
        select 1
        from public.forms f
        where f.id = form_id
          and (
            (f.scope = 'GLOBAL' and f.status = 'ACTIVE')
            or (f.scope = 'PRIVATE' and f.owner_user_id = auth.uid())
          )
      )
    )
  );

create policy "collection_forms_update"
  on public.collection_forms
  for update
  to authenticated
  using (public.can_mutate_collection(collection_id))
  with check (
    public.can_mutate_collection(collection_id)
    and (
      public.is_app_admin()
      or exists (
        select 1
        from public.forms f
        where f.id = form_id
          and (
            (f.scope = 'GLOBAL' and f.status = 'ACTIVE')
            or (f.scope = 'PRIVATE' and f.owner_user_id = auth.uid())
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 9. field_resolvers (read all authenticated; mutate admin only)
-- ---------------------------------------------------------------------------

drop policy if exists "field_resolvers_authenticated_all" on public.field_resolvers;
drop policy if exists "field_resolvers_select" on public.field_resolvers;
drop policy if exists "field_resolvers_insert" on public.field_resolvers;
drop policy if exists "field_resolvers_update" on public.field_resolvers;

create policy "field_resolvers_select"
  on public.field_resolvers
  for select
  to authenticated
  using (true);

create policy "field_resolvers_insert"
  on public.field_resolvers
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "field_resolvers_update"
  on public.field_resolvers
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 10. organizations / organization_members / user_agent_settings
-- ---------------------------------------------------------------------------

drop policy if exists "organizations_authenticated_all" on public.organizations;
drop policy if exists "organizations_select" on public.organizations;
drop policy if exists "organizations_insert" on public.organizations;
drop policy if exists "organizations_update" on public.organizations;

create policy "organizations_select"
  on public.organizations
  for select
  to authenticated
  using (
    public.is_active_organization_member(id)
    or public.is_app_admin()
  );

create policy "organizations_insert"
  on public.organizations
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "organizations_update"
  on public.organizations
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "organization_members_authenticated_all"
  on public.organization_members;
drop policy if exists "organization_members_select"
  on public.organization_members;
drop policy if exists "organization_members_insert"
  on public.organization_members;
drop policy if exists "organization_members_update"
  on public.organization_members;

create policy "organization_members_select"
  on public.organization_members
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy "organization_members_insert"
  on public.organization_members
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "organization_members_update"
  on public.organization_members
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "user_agent_settings_authenticated_all"
  on public.user_agent_settings;
drop policy if exists "user_agent_settings_select"
  on public.user_agent_settings;
drop policy if exists "user_agent_settings_insert"
  on public.user_agent_settings;
drop policy if exists "user_agent_settings_update"
  on public.user_agent_settings;

create policy "user_agent_settings_select"
  on public.user_agent_settings
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy "user_agent_settings_insert"
  on public.user_agent_settings
  for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_app_admin());

create policy "user_agent_settings_update"
  on public.user_agent_settings
  for update
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin())
  with check (user_id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 11. brokerage_settings / app_settings
-- ---------------------------------------------------------------------------

drop policy if exists "brokerage_settings_authenticated_all"
  on public.brokerage_settings;
drop policy if exists "brokerage_settings_select"
  on public.brokerage_settings;
drop policy if exists "brokerage_settings_insert"
  on public.brokerage_settings;
drop policy if exists "brokerage_settings_update"
  on public.brokerage_settings;

create policy "brokerage_settings_select"
  on public.brokerage_settings
  for select
  to authenticated
  using (true);

create policy "brokerage_settings_insert"
  on public.brokerage_settings
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "brokerage_settings_update"
  on public.brokerage_settings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "app_settings_authenticated_all" on public.app_settings;
drop policy if exists "app_settings_select" on public.app_settings;
drop policy if exists "app_settings_insert" on public.app_settings;
drop policy if exists "app_settings_update" on public.app_settings;

create policy "app_settings_select"
  on public.app_settings
  for select
  to authenticated
  using (true);

create policy "app_settings_insert"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_app_admin());

create policy "app_settings_update"
  on public.app_settings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 12. acroform_field_mapping_memory
-- ---------------------------------------------------------------------------

drop policy if exists "acroform_field_mapping_memory_authenticated_all"
  on public.acroform_field_mapping_memory;
drop policy if exists "acroform_field_mapping_memory_select"
  on public.acroform_field_mapping_memory;
drop policy if exists "acroform_field_mapping_memory_insert"
  on public.acroform_field_mapping_memory;
drop policy if exists "acroform_field_mapping_memory_update"
  on public.acroform_field_mapping_memory;

create policy "acroform_field_mapping_memory_select"
  on public.acroform_field_mapping_memory
  for select
  to authenticated
  using (public.can_read_field(field_id));

create policy "acroform_field_mapping_memory_insert"
  on public.acroform_field_mapping_memory
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    or public.can_mutate_field(field_id)
  );

create policy "acroform_field_mapping_memory_update"
  on public.acroform_field_mapping_memory
  for update
  to authenticated
  using (
    public.is_app_admin()
    or public.can_mutate_field(field_id)
  )
  with check (
    public.is_app_admin()
    or public.can_mutate_field(field_id)
  );

-- ---------------------------------------------------------------------------
-- 13. storage_path_migrations (admin manage only; drop broad select)
-- ---------------------------------------------------------------------------

drop policy if exists "storage_path_migrations_authenticated_select"
  on public.storage_path_migrations;
drop policy if exists "storage_path_migrations_admin_all"
  on public.storage_path_migrations;

create policy "storage_path_migrations_admin_all"
  on public.storage_path_migrations
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Table grants remain on authenticated; policies restrict to is_app_admin().
grant select, insert, update, delete on table public.storage_path_migrations
  to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Legacy tables (if present): admin-only; no open authenticated_all
-- ---------------------------------------------------------------------------

drop policy if exists "legacy_form_field_mappings_authenticated_all"
  on public.legacy_form_field_mappings;
drop policy if exists "form_field_mappings_authenticated_all"
  on public.legacy_form_field_mappings;
drop policy if exists "legacy_form_field_mappings_admin_select"
  on public.legacy_form_field_mappings;
drop policy if exists "legacy_form_field_mappings_admin_update"
  on public.legacy_form_field_mappings;

create policy "legacy_form_field_mappings_admin_select"
  on public.legacy_form_field_mappings
  for select
  to authenticated
  using (public.is_app_admin());

create policy "legacy_form_field_mappings_admin_update"
  on public.legacy_form_field_mappings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "legacy_template_pdf_fields_authenticated_all"
  on public.legacy_template_pdf_fields;
drop policy if exists "template_pdf_fields_authenticated_all"
  on public.legacy_template_pdf_fields;
drop policy if exists "legacy_template_pdf_fields_admin_select"
  on public.legacy_template_pdf_fields;
drop policy if exists "legacy_template_pdf_fields_admin_update"
  on public.legacy_template_pdf_fields;

create policy "legacy_template_pdf_fields_admin_select"
  on public.legacy_template_pdf_fields
  for select
  to authenticated
  using (public.is_app_admin());

create policy "legacy_template_pdf_fields_admin_update"
  on public.legacy_template_pdf_fields
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

commit;
