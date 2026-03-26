alter table public.form_fields
  drop constraint if exists form_fields_field_type_check;

alter table public.form_fields
  add constraint form_fields_field_type_check
  check (field_type in ('short_text', 'long_text', 'select', 'radio', 'checkboxes'));
