-- Tankhilfe24: vehicle registration (Fahrzeugschein) scan.
-- Stores the extracted necessary fields as readable JSON on the order, plus a
-- URL reference to the uploaded photo. admin_orders() does `select *`, so these
-- columns flow through to the admin log automatically.

alter table public.orders add column if not exists vehicle_doc     jsonb;
alter table public.orders add column if not exists vehicle_doc_url  text;

-- Public bucket holding the uploaded Fahrzeugschein photos. The order keeps the
-- public URL as a reference; the image is never read back into the funnel.
insert into storage.buckets (id, name, public)
values ('vehicle-docs', 'vehicle-docs', true)
on conflict (id) do nothing;

-- Anon customers may upload their own Fahrzeugschein photo from the public funnel.
drop policy if exists "public can upload vehicle docs" on storage.objects;
create policy "public can upload vehicle docs"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'vehicle-docs');

-- ...and read it back (bucket is public; explicit policy for clarity).
drop policy if exists "public can read vehicle docs" on storage.objects;
create policy "public can read vehicle docs"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'vehicle-docs');
