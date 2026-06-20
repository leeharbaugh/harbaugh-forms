-- Store the PDF page dimensions used when a field was placed.

alter table public.template_pdf_fields
  add column page_width numeric(10, 2),
  add column page_height numeric(10, 2);
