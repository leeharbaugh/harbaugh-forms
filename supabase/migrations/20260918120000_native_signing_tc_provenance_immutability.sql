-- Native Signing TC follow-up: immutable Signing creator/sender provenance.
-- Forward-only. Development only. Does not rewrite historical values.

begin;

create or replace function public.signings_enforce_provenance_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Creator and responsible-sender provenance are immutable after create.
    -- Trusted server sets them on INSERT; ordinary updates must not rewrite them.
    new.created_by_user_id := old.created_by_user_id;
    new.original_sender_user_id := old.original_sender_user_id;
    new.original_sender_display_name := old.original_sender_display_name;
    new.original_sender_email := old.original_sender_email;
  end if;
  return new;
end;
$$;

comment on function public.signings_enforce_provenance_immutability() is
  'Preserves signings.created_by_user_id and original_sender_* on UPDATE so TC/agent provenance cannot be rewritten after create.';

drop trigger if exists signings_enforce_provenance_immutability
  on public.signings;
create trigger signings_enforce_provenance_immutability
before update on public.signings
for each row execute function public.signings_enforce_provenance_immutability();

comment on column public.signings.created_by_user_id is
  'Actual User who created the Signing (may be a TC). Immutable after insert. Distinct from original_sender_* and PRIMARY association.';

commit;
