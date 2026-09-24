-- Calendar module storage: the whole calendar (people, org, requests, schedule,
-- holidays, shifts, BCP, notification log) as one versioned JSON document.
-- Interim design so the Calendar can be used and saved now; the normalized
-- tables in the handoff data model replace it when the Calendar moves to
-- Entra sign-in and real data. Same access model as the Workload functions.

create table workforce.cal_state (
  id          text primary key,
  data        jsonb not null,
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);
alter table workforce.cal_state enable row level security;
revoke all on workforce.cal_state from public, anon, authenticated;

create or replace function public.workforce_cal_snapshot(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('data', s.data, 'version', s.version)
  from workforce.cal_state s where s.id = p_id;
$$;

-- p_version = the version the caller read (0 = create). Mismatch raises workforce_conflict.
create or replace function public.workforce_cal_save(p_id text, p_data jsonb, p_version int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
begin
  if p_version = 0 then
    insert into workforce.cal_state (id, data) values (p_id, p_data)
    on conflict (id) do nothing
    returning version into v;
  else
    update workforce.cal_state
       set data = p_data, version = version + 1, updated_at = now()
     where id = p_id and version = p_version
    returning version into v;
  end if;
  if v is null then raise exception 'workforce_conflict' using detail = 'calendar'; end if;
  return v;
end;
$$;

revoke all on function public.workforce_cal_snapshot(text) from public, anon, authenticated;
revoke all on function public.workforce_cal_save(text, jsonb, int) from public, anon, authenticated;
grant execute on function public.workforce_cal_snapshot(text) to service_role;
grant execute on function public.workforce_cal_save(text, jsonb, int) to service_role;
-- Temporary, like 0002: the publishable key may call them until the secret key is configured.
grant execute on function public.workforce_cal_snapshot(text) to anon;
grant execute on function public.workforce_cal_save(text, jsonb, int) to anon;
