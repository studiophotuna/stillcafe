-- Storage bucket for package images.
-- Public read so customers can view package photos; writes happen server-side
-- with the service role key.

insert into storage.buckets (id, name, public)
values ('package-images', 'package-images', true)
on conflict (id) do nothing;

drop policy if exists "package images public read" on storage.objects;
create policy "package images public read" on storage.objects
  for select using (bucket_id = 'package-images');
