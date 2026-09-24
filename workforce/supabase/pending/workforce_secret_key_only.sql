-- Apply once SUPABASE_SECRET_KEY is set for the workforce Vercel project (and redeployed):
-- closes the Workload and Calendar functions to the public key again.
revoke execute on function public.workforce_snapshot(text) from anon;
revoke execute on function public.workforce_apply(text, jsonb) from anon;
revoke execute on function public.workforce_cal_snapshot(text) from anon;
revoke execute on function public.workforce_cal_save(text, jsonb, int) from anon;
