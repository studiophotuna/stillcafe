-- Cheap "has anything changed?" checks for the background refresh.
--
-- Open pages refresh every half minute. Before this, each refresh read the whole calendar
-- (and, for Workload, every task and the calendar again). Now the page sends the stamp it
-- last saw; the server asks for the current stamp first and only reads the full data when
-- it differs. Same session rule as the data functions: a valid sign-in is required.

create or replace function public.workforce_cal_version(p_token text, p_id text) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  perform workforce.session_person(p_token);
  return coalesce((select s.version from workforce.cal_state s where s.id = p_id), 0);
end $$;

-- A team's Workload stamp: the calendar version (people, org) plus the latest change to the
-- team, its tasks and its activities, and their counts (so a removed activity also counts).
create or replace function public.workforce_wl_stamp(p_token text, p_team text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform workforce.session_person(p_token);
  return concat_ws(':',
    coalesce((select s.version from workforce.cal_state s where s.id = 'main'), 0),
    coalesce((select (extract(epoch from t.updated_at) * 1000)::bigint from workforce.team t where t.id = p_team), 0),
    coalesce((select (extract(epoch from max(k.updated_at)) * 1000)::bigint from workforce.task k where k.team_id = p_team), 0),
    (select count(*) from workforce.task k where k.team_id = p_team),
    coalesce((select (extract(epoch from max(a.updated_at)) * 1000)::bigint from workforce.activity a where a.team_id = p_team), 0),
    (select count(*) from workforce.activity a where a.team_id = p_team));
end $$;

create index if not exists task_team_updated on workforce.task (team_id, updated_at);
create index if not exists activity_team_updated on workforce.activity (team_id, updated_at);

revoke all on function public.workforce_cal_version(text, text), public.workforce_wl_stamp(text, text) from public, authenticated;
grant execute on function public.workforce_cal_version(text, text), public.workforce_wl_stamp(text, text) to anon, service_role;
