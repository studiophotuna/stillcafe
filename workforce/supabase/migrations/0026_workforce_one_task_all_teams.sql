-- One task in progress at a time counts across all of a person's teams, not just within each
-- team. A person in two teams could start a task in each.
--
-- workforce_my_busy: the signed-in person's tasks in progress in teams other than p_team, so
-- Workload can stop them starting one here. The stamp now includes them too, so a team that's
-- open notices when the person starts or finishes a task in another team.

create or replace function public.workforce_my_busy(p_token text, p_team text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pid int := workforce.session_person(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('pid', k.assignee, 'team', k.team_id, 'id', k.id, 'title', k.title))
    from workforce.task k
    where k.assignee = pid and k.status = 'in_progress' and k.team_id <> p_team), '[]'::jsonb);
end $$;

create or replace function public.workforce_wl_stamp(p_token text, p_team text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  pid int := workforce.session_person(p_token);
begin
  return concat_ws(':',
    coalesce((select s.version from workforce.cal_state s where s.id = 'main'), 0),
    coalesce((select (extract(epoch from t.updated_at) * 1000)::bigint from workforce.team t where t.id = p_team), 0),
    coalesce((select (extract(epoch from max(k.updated_at)) * 1000)::bigint from workforce.task k where k.team_id = p_team), 0),
    (select count(*) from workforce.task k where k.team_id = p_team),
    coalesce((select (extract(epoch from max(a.updated_at)) * 1000)::bigint from workforce.activity a where a.team_id = p_team), 0),
    (select count(*) from workforce.activity a where a.team_id = p_team),
    coalesce((select string_agg(k.team_id || '/' || k.id, ',' order by k.id) from workforce.task k
      where k.assignee = pid and k.status = 'in_progress' and k.team_id <> p_team), ''));
end $$;

-- The database rule too: one task in progress per person, whichever team it's in.
create unique index if not exists task_one_in_progress_any on workforce.task (assignee) where status = 'in_progress';

revoke all on function public.workforce_my_busy(text, text) from public, authenticated;
grant execute on function public.workforce_my_busy(text, text) to anon, service_role;
