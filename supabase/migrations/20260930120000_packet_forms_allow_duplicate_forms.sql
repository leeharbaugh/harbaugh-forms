-- A packet may contain multiple independent ACTIVE instances of the same form
-- (e.g. two Amendments to Contract). Packet forms are identified by
-- packet_forms.id; (packet_id, form_id) is not unique.
--
-- Drops only the duplicate-form restriction introduced in
-- 20250610190000_packet_forms_origin_and_external.sql. Existing rows, field
-- instances, annotations, lifecycle triggers, and RLS are unchanged.

drop index if exists public.packet_forms_packet_form_internal_active_uidx;
