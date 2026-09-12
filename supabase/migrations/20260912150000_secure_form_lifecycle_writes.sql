-- Security remediation F2/F8: lifecycle history is generated only by the
-- database trigger, and publication can only occur through the trusted
-- server-side publish operation.
--
-- Forward-only: this replaces the permissive writer surface created by the
-- original lifecycle migration without rewriting applied migration history.

begin;

-- Lifecycle events are evidence of actual form transitions. Browser clients
-- may read the rows allowed by RLS but must never insert, edit, or delete them.
revoke insert, update, delete on table public.form_state_events from anon;
revoke insert, update, delete on table public.form_state_events from authenticated;
revoke usage, select on sequence public.form_state_events_id_seq from anon;
revoke usage, select on sequence public.form_state_events_id_seq from authenticated;

drop policy if exists "form_state_events_insert" on public.form_state_events;
drop policy if exists "form_state_events_update" on public.form_state_events;

revoke all on function public.insert_form_state_event(
  bigint, text, text, text, text, text, text, uuid
) from public;
revoke all on function public.insert_form_state_event(
  bigint, text, text, text, text, text, text, uuid
) from anon;
revoke all on function public.insert_form_state_event(
  bigint, text, text, text, text, text, text, uuid
) from authenticated;

-- The secure publish function sets app.form_lifecycle_actor through a helper
-- that is executable only by service_role. A regular authenticated request
-- cannot set that transaction-local value, so a direct forms-table UPDATE can
-- no longer take the ACTIVE+DRAFT -> ACTIVE+PUBLISHED transition.
create or replace function public.enforce_form_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_changed boolean;
  pub_changed boolean;
  v_trusted_publish_actor uuid;
begin
  if new.form_family_key is null or trim(new.form_family_key) = '' then
    new.form_family_key := upper(trim(coalesce(new.form_code, 'FORM-' || new.id::text)));
  else
    new.form_family_key := upper(trim(new.form_family_key));
  end if;

  if new.publication_state is null then
    new.publication_state := 'DRAFT';
  end if;

  if new.status = 'INACTIVE' and new.publication_state = 'PUBLISHED' then
    raise exception
      'INACTIVE forms cannot be PUBLISHED (form_id=%)',
      new.id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.publication_state not in ('DRAFT', 'PUBLISHED') then
      raise exception 'invalid publication_state %', new.publication_state
        using errcode = 'check_violation';
    end if;
    if auth.uid() is not null then
      if new.status is distinct from 'ACTIVE' then
        raise exception
          'new forms must be created as ACTIVE (form_id=%)',
          coalesce(new.id, 0)
          using errcode = 'check_violation';
      end if;
      if new.publication_state is distinct from 'DRAFT' then
        raise exception
          'new forms must be created as DRAFT (form_id=%)',
          coalesce(new.id, 0)
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  status_changed := new.status is distinct from old.status;
  pub_changed := new.publication_state is distinct from old.publication_state;

  if not status_changed and not pub_changed then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.status = 'DELETED' and old.status in ('ACTIVE', 'INACTIVE') then
    new.publication_state := case
      when old.publication_state = 'PUBLISHED' then 'DRAFT'
      else coalesce(new.publication_state, old.publication_state, 'DRAFT')
    end;
    if new.publication_state = 'PUBLISHED' then
      new.publication_state := 'DRAFT';
    end if;
    return new;
  end if;

  if old.status = 'DELETED' and new.status is distinct from 'DELETED' then
    raise exception
      'deleted forms cannot be restored through ordinary update (form_id=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  if old.status = 'ACTIVE'
     and old.publication_state = 'DRAFT'
     and new.status = 'ACTIVE'
     and new.publication_state = 'PUBLISHED'
     and not status_changed then
    begin
      v_trusted_publish_actor := nullif(
        trim(current_setting('app.form_lifecycle_actor', true)),
        ''
      )::uuid;
    exception
      when others then
        v_trusted_publish_actor := null;
    end;

    if v_trusted_publish_actor is null then
      raise exception
        'forms can only be published through the trusted publish operation (form_id=%)',
        old.id
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if old.status = 'ACTIVE'
     and old.publication_state = 'PUBLISHED'
     and new.status = 'ACTIVE'
     and new.publication_state = 'DRAFT'
     and not status_changed then
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  if old.status = 'ACTIVE'
     and new.status = 'INACTIVE'
     and new.publication_state = 'DRAFT' then
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  if old.status = 'INACTIVE'
     and old.publication_state = 'DRAFT'
     and new.status = 'ACTIVE'
     and new.publication_state = 'DRAFT' then
    if not public.is_app_admin() then
      raise exception
        'only application admins can restore retired forms (form_id=%)',
        old.id
        using errcode = 'insufficient_privilege';
    end if;
    new.published_at := null;
    new.published_by_user_id := null;
    return new;
  end if;

  raise exception
    'invalid form lifecycle transition: %(%) -> %(%) (form_id=%)',
    old.status,
    old.publication_state,
    new.status,
    new.publication_state,
    old.id
    using errcode = 'check_violation';
end;
$$;

commit;
