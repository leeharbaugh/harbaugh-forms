-- Authoritative creator attribution for packet_form_annotations.
-- Forward-only follow-up to 20260805220000 (already applied on development).
-- Does not rewrite existing annotation rows; preserves create_date/update_date/status.

begin;

-- INVOKER is sufficient: only rewrites NEW.created_by_user_id from auth.uid()/OLD.
-- No table access beyond the triggering row; no elevated privileges required.
create or replace function public.packet_form_annotations_enforce_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Authenticated clients: creator is always the session user (ignore client UUID).
    -- Service-role / no JWT (auth.uid() null): leave supplied value for maintenance paths.
    if auth.uid() is not null then
      new.created_by_user_id := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Creator attribution is immutable after insert (move/resize/soft-delete included).
    new.created_by_user_id := old.created_by_user_id;
    return new;
  end if;

  return new;
end;
$$;

comment on function public.packet_form_annotations_enforce_created_by() is
  'Forces packet_form_annotations.created_by_user_id = auth.uid() on INSERT for '
  'authenticated sessions, and preserves OLD.created_by_user_id on UPDATE. '
  'Authorization remains owns_packet / is_app_admin (not creator-only). '
  'INVOKER + search_path=public; not SECURITY DEFINER.';

drop trigger if exists packet_form_annotations_enforce_created_by
  on public.packet_form_annotations;

create trigger packet_form_annotations_enforce_created_by
  before insert or update on public.packet_form_annotations
  for each row
  execute function public.packet_form_annotations_enforce_created_by();

-- Tighten INSERT policy: after the BEFORE trigger, authenticated inserts must
-- attribute to auth.uid(). Removes the prior null / admin spoof loopholes.
drop policy if exists "packet_form_annotations_insert" on public.packet_form_annotations;

create policy "packet_form_annotations_insert"
  on public.packet_form_annotations
  for insert
  to authenticated
  with check (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
    )
    and created_by_user_id = auth.uid()
  );

-- UPDATE authorization remains packet-scoped (owns_packet / is_app_admin).
-- Creator immutability is enforced by the BEFORE UPDATE trigger above; avoid a
-- same-table SELECT in WITH CHECK (RLS recursion risk).
drop policy if exists "packet_form_annotations_update" on public.packet_form_annotations;

create policy "packet_form_annotations_update"
  on public.packet_form_annotations
  for update
  to authenticated
  using (public.owns_packet(packet_id) or public.is_app_admin())
  with check (
    (public.owns_packet(packet_id) or public.is_app_admin())
    and exists (
      select 1
      from public.packet_forms pf
      where pf.id = packet_form_id
        and pf.packet_id = packet_form_annotations.packet_id
    )
  );

comment on column public.packet_form_annotations.created_by_user_id is
  'Authenticated creator (auth.uid()) assigned by trigger on INSERT; immutable on UPDATE.';

commit;
