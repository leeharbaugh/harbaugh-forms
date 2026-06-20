-- Phase 1: vocabulary alignment (table and FK column renames only).
-- No drops. Legacy tables (representation_agreements, form_field_mappings,
-- template_pdf_fields, etc.) are retained.

-- ---------------------------------------------------------------------------
-- clients → contacts
-- ---------------------------------------------------------------------------

alter table public.clients rename to contacts;

alter table public.contacts rename column client_type to contact_type;

alter table public.contacts rename constraint clients_status_check to contacts_status_check;
alter table public.contacts rename constraint clients_client_type_check to contacts_contact_type_check;
alter table public.contacts rename constraint clients_individual_name_check to contacts_individual_name_check;
alter table public.contacts rename constraint clients_entity_name_check to contacts_entity_name_check;

alter index public.clients_status_idx rename to contacts_status_idx;
alter index public.clients_last_name_idx rename to contacts_last_name_idx;
alter index public.clients_entity_name_idx rename to contacts_entity_name_idx;
alter index public.clients_email_active_uidx rename to contacts_email_active_uidx;

alter trigger clients_set_update_date on public.contacts rename to contacts_set_update_date;

-- ---------------------------------------------------------------------------
-- representation_agreement_clients: FK column to contacts
-- ---------------------------------------------------------------------------

alter table public.representation_agreement_clients
  rename column client_id to contact_id;

alter index public.representation_agreement_clients_client_id_idx
  rename to representation_agreement_clients_contact_id_idx;

alter index public.representation_agreement_clients_pair_active_uidx
  rename to representation_agreement_clients_agreement_contact_active_uidx;

-- Recreate unique index with new column name
drop index if exists public.representation_agreement_clients_agreement_contact_active_uidx;

create unique index representation_agreement_clients_pair_active_uidx
  on public.representation_agreement_clients (representation_agreement_id, contact_id)
  where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- form_templates → forms
-- ---------------------------------------------------------------------------

alter table public.form_templates rename to forms;

alter table public.forms rename column template_code to form_code;
alter table public.forms rename column template_name to form_name;

alter table public.forms rename constraint form_templates_status_check to forms_status_check;
alter table public.forms rename constraint form_templates_form_category_check to forms_form_category_check;
alter table public.forms rename constraint form_templates_template_code_not_blank to forms_form_code_not_blank;
alter table public.forms rename constraint form_templates_template_name_not_blank to forms_form_name_not_blank;
alter table public.forms rename constraint form_templates_source_path_not_blank to forms_source_path_not_blank;

alter index public.form_templates_status_idx rename to forms_status_idx;
alter index public.form_templates_form_category_idx rename to forms_form_category_idx;
alter index public.form_templates_code_version_active_uidx rename to forms_code_version_active_uidx;

alter trigger form_templates_set_update_date on public.forms rename to forms_set_update_date;

-- ---------------------------------------------------------------------------
-- FK columns referencing forms (legacy field tables kept)
-- ---------------------------------------------------------------------------

alter table public.form_field_mappings
  rename column form_template_id to form_id;

alter index public.form_field_mappings_form_template_id_idx
  rename to form_field_mappings_form_id_idx;

drop index if exists public.form_field_mappings_template_field_active_uidx;

create unique index form_field_mappings_form_field_active_uidx
  on public.form_field_mappings (form_id, lower(field_key))
  where status = 'ACTIVE';

alter table public.template_pdf_fields
  rename column form_template_id to form_id;

alter index public.template_pdf_fields_form_template_id_idx
  rename to template_pdf_fields_form_id_idx;

drop index if exists public.template_pdf_fields_template_field_active_uidx;

create unique index template_pdf_fields_form_field_active_uidx
  on public.template_pdf_fields (form_id, lower(field_key))
  where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- packet_templates → collections
-- ---------------------------------------------------------------------------

alter table public.packet_templates rename to collections;

alter table public.collections rename column packet_name to collection_name;
alter table public.collections rename column packet_type to collection_type;

alter table public.collections rename constraint packet_templates_status_check to collections_status_check;
alter table public.collections rename constraint packet_templates_packet_type_check to collections_collection_type_check;
alter table public.collections rename constraint packet_templates_packet_name_not_blank to collections_collection_name_not_blank;

alter index public.packet_templates_status_idx rename to collections_status_idx;
alter index public.packet_templates_packet_type_idx rename to collections_collection_type_idx;
alter index public.packet_templates_name_active_uidx rename to collections_name_active_uidx;

alter trigger packet_templates_set_update_date on public.collections rename to collections_set_update_date;

-- ---------------------------------------------------------------------------
-- packet_template_forms → collection_forms
-- ---------------------------------------------------------------------------

alter table public.packet_template_forms rename to collection_forms;

alter table public.collection_forms rename column packet_template_id to collection_id;
alter table public.collection_forms rename column form_template_id to form_id;

alter table public.collection_forms rename constraint packet_template_forms_status_check to collection_forms_status_check;
alter table public.collection_forms rename constraint packet_template_forms_sort_order_non_negative to collection_forms_sort_order_non_negative;

alter index public.packet_template_forms_status_idx rename to collection_forms_status_idx;
alter index public.packet_template_forms_packet_template_id_idx rename to collection_forms_collection_id_idx;

drop index if exists public.packet_template_forms_packet_form_active_uidx;
drop index if exists public.packet_template_forms_packet_sort_active_uidx;

create unique index collection_forms_collection_form_active_uidx
  on public.collection_forms (collection_id, form_id)
  where status = 'ACTIVE';

create unique index collection_forms_collection_sort_active_uidx
  on public.collection_forms (collection_id, sort_order)
  where status = 'ACTIVE';

alter trigger packet_template_forms_set_update_date on public.collection_forms
  rename to collection_forms_set_update_date;

-- ---------------------------------------------------------------------------
-- generated_packets → packets
-- ---------------------------------------------------------------------------

alter table public.generated_packets rename to packets;

alter table public.packets rename column packet_template_id to collection_id;
alter table public.packets rename column packet_label to label;

alter table public.packets rename constraint generated_packets_status_check to packets_status_check;
alter table public.packets rename constraint generated_packets_packet_label_not_blank to packets_label_not_blank;

alter index public.generated_packets_status_idx rename to packets_status_idx;
alter index public.generated_packets_packet_template_id_idx rename to packets_collection_id_idx;
alter index public.generated_packets_representation_agreement_id_idx rename to packets_representation_agreement_id_idx;

alter trigger generated_packets_set_update_date on public.packets rename to packets_set_update_date;

-- ---------------------------------------------------------------------------
-- generated_documents → packet_forms
-- ---------------------------------------------------------------------------

alter table public.generated_documents rename to packet_forms;

alter table public.packet_forms rename column generated_packet_id to packet_id;
alter table public.packet_forms rename column form_template_id to form_id;

alter table public.packet_forms rename constraint generated_documents_status_check to packet_forms_status_check;

alter index public.generated_documents_status_idx rename to packet_forms_status_idx;

alter trigger generated_documents_set_update_date on public.packet_forms
  rename to packet_forms_set_update_date;

-- RLS policies follow table renames automatically; recreate named policies for clarity.

drop policy if exists "clients_authenticated_all" on public.contacts;
create policy "contacts_authenticated_all"
  on public.contacts for all to authenticated
  using (true) with check (true);

drop policy if exists "form_templates_authenticated_all" on public.forms;
create policy "forms_authenticated_all"
  on public.forms for all to authenticated
  using (true) with check (true);

drop policy if exists "packet_templates_authenticated_all" on public.collections;
create policy "collections_authenticated_all"
  on public.collections for all to authenticated
  using (true) with check (true);

drop policy if exists "packet_template_forms_authenticated_all" on public.collection_forms;
create policy "collection_forms_authenticated_all"
  on public.collection_forms for all to authenticated
  using (true) with check (true);

drop policy if exists "generated_packets_authenticated_all" on public.packets;
create policy "packets_authenticated_all"
  on public.packets for all to authenticated
  using (true) with check (true);

drop policy if exists "generated_documents_authenticated_all" on public.packet_forms;
create policy "packet_forms_authenticated_all"
  on public.packet_forms for all to authenticated
  using (true) with check (true);
