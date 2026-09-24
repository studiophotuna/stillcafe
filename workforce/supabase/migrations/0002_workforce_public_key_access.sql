-- Temporary: let the publishable (anon) key call the two Workload functions, because the
-- app has no secret key configured yet. Tables stay closed; only these functions are callable.
-- Revoke with supabase/pending/workforce_secret_key_only.sql once SUPABASE_SECRET_KEY is set in Vercel,
-- and before any real (non-sample) data is stored.
grant execute on function public.workforce_snapshot(text) to anon;
grant execute on function public.workforce_apply(text, jsonb) to anon;
