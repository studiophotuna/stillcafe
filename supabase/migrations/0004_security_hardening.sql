-- Security hardening based on Supabase advisor findings.

-- 1. Pin the trigger function's search_path to avoid search_path injection.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. A public bucket already serves objects via their public URL without any
--    SELECT policy on storage.objects. The broad read policy additionally lets
--    clients *list* every file in the bucket, which we don't need (image URLs
--    are stored directly on packages). Drop it. Uploads continue to work
--    because they run with the service-role key, which bypasses RLS.
drop policy if exists "package images public read" on storage.objects;

-- Note: public.bookings and public.payments intentionally have RLS enabled with
-- no policies. This denies all anon/authenticated access; only the server
-- (service-role key) can read/write them, keeping customer data private.
