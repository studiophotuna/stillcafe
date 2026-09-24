-- Apply once SUPABASE_SECRET_KEY is set for the workforce Vercel project (and redeployed):
-- only the app's server can then call the workforce functions. Until then they are callable with
-- the public key, but every data function still needs a valid sign-in session (migration 0004).
do $$
declare f text;
begin
  foreach f in array array[
    'workforce_login(text,text)', 'workforce_session(text)', 'workforce_logout(text)',
    'workforce_change_password(text,text,text)', 'workforce_set_login(text,text,int,text)',
    'workforce_remove_login(text,int)', 'workforce_logins(text)',
    'workforce_cal_snapshot(text,text)', 'workforce_cal_save(text,text,jsonb,int)',
    'workforce_snapshot(text,text)', 'workforce_apply(text,text,jsonb)'] loop
    execute format('revoke execute on function public.%s from anon', f);
  end loop;
end $$;
