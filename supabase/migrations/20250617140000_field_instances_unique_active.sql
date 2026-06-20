-- One active field_instance per packet form + catalog field.

create unique index if not exists field_instances_packet_form_field_active_uidx
  on public.field_instances (packet_form_id, field_id)
  where status = 'ACTIVE';
