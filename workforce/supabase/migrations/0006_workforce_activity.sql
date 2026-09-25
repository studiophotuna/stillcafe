-- Member status log for Workload: breaks, lunch, meetings, ad hoc work and training
-- (so utilization uses real time away from tasks), and "end work" with the overtime
-- the member reports. Overtime counts only once a Workload admin or a lead of the
-- team approves it.
--
-- Rows are versioned like tasks. The database checks who may write what:
-- members only their own rows and never a decided overtime; approvers (team or
-- system admins, and leads/managers/directors of the team) may decide overtime,
-- but not their own.

create table workforce.activity (
  team_id     text not null references workforce.team (id) on delete cascade,
  id          text not null,
  person_id   int not null,
  kind        text not null check (kind in ('break', 'lunch', 'meeting', 'adhoc', 'training', 'end')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  ot_min      int not null default 0 check (ot_min between 0 and 1440),
  ot_status   text check (ot_status in ('pending', 'approved', 'declined')),
  decided_by  int,
  decided_at  timestamptz,
  version     int not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (team_id, id)
);
create index activity_team_start on workforce.activity (team_id, started_at);
alter table workforce.activity enable row level security;
revoke all on workforce.activity from public, anon, authenticated;

-- A lead, manager or director allocated to the team, anything under it, or its tower/department.
create or replace function workforce.is_leader_of(pid int, p_team text) returns boolean
language sql stable set search_path = '' as $$
  with recursive n as (
    select x ->> 'id' id, x ->> 'parent' parent
      from workforce.cal_state s, jsonb_array_elements(s.data -> 'nodes') x where s.id = 'main'),
  up as (select id, parent from n where id = p_team
         union select n.id, n.parent from n join up on n.id = up.parent),
  down as (select id from n where id = p_team
           union select n.id from n join down on n.parent = down.id),
  me as (select p from workforce.cal_state s, jsonb_array_elements(s.data -> 'people') p
          where s.id = 'main' and (p ->> 'id')::int = pid)
  select exists (
    select 1 from me
     where coalesce(me.p ->> 'level', 'member') <> 'member'
       and exists (select 1 from jsonb_array_elements_text(me.p -> 'assign') a
                    where a in (select id from up) or a in (select id from down)));
$$;
revoke all on function workforce.is_leader_of(int, text) from public, anon, authenticated;

-- Activity since a time (ms since epoch), oldest first.
create or replace function public.workforce_activities(p_token text, p_team text, p_since bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform workforce.session_person(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'pid', a.person_id, 'kind', a.kind,
      'start', (extract(epoch from a.started_at) * 1000)::bigint,
      'end', (extract(epoch from a.ended_at) * 1000)::bigint,
      'otMin', a.ot_min, 'otStatus', a.ot_status, 'decidedBy', a.decided_by,
      'decidedAt', (extract(epoch from a.decided_at) * 1000)::bigint,
      'version', a.version) order by a.started_at)
      from workforce.activity a
     where a.team_id = p_team
       and (a.started_at >= to_timestamp(p_since / 1000.0) or a.ended_at is null or a.ot_status = 'pending')), '[]'::jsonb);
end $$;

-- Insert (version 0), update (matching version) or delete ("deleted": true) activity rows.
create or replace function public.workforce_save_activities(p_token text, p_team text, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me int := workforce.session_person(p_token);
  approver boolean := workforce.is_admin(me) or workforce.is_leader_of(me, p_team);
  r record;
  old workforce.activity;
  n int;
begin
  for r in
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      id text, pid int, kind text, start bigint, "end" bigint, "otMin" int, "otStatus" text,
      "decidedBy" int, "decidedAt" bigint, version int, deleted boolean)
  loop
    select * into old from workforce.activity where team_id = p_team and id = r.id;
    -- Members write only their own rows, and can't touch overtime that has been decided.
    if not approver and (r.pid <> me or (old.id is not null and old.person_id <> me)) then
      raise exception 'workforce_forbidden';
    end if;
    if not approver and (old.ot_status in ('approved', 'declined') or coalesce(r."otStatus", 'pending') <> 'pending') then
      raise exception 'workforce_forbidden';
    end if;
    -- Deciding overtime: approvers only, never their own.
    if r."otStatus" in ('approved', 'declined') and old.ot_status is distinct from r."otStatus" and (not approver or r.pid = me) then
      raise exception 'workforce_forbidden';
    end if;
    if coalesce(r.deleted, false) then
      delete from workforce.activity where team_id = p_team and id = r.id and version = r.version;
    elsif r.version = 0 then
      insert into workforce.activity (team_id, id, person_id, kind, started_at, ended_at, ot_min, ot_status, decided_by, decided_at)
      values (p_team, r.id, r.pid, r.kind, to_timestamp(r.start / 1000.0), to_timestamp(r."end" / 1000.0),
        greatest(coalesce(r."otMin", 0), 0), r."otStatus", r."decidedBy", to_timestamp(r."decidedAt" / 1000.0))
      on conflict (team_id, id) do nothing;
    else
      update workforce.activity
         set kind = r.kind, started_at = to_timestamp(r.start / 1000.0), ended_at = to_timestamp(r."end" / 1000.0),
             ot_min = greatest(coalesce(r."otMin", 0), 0), ot_status = r."otStatus", decided_by = r."decidedBy",
             decided_at = to_timestamp(r."decidedAt" / 1000.0), version = version + 1, updated_at = now()
       where team_id = p_team and id = r.id and version = r.version and person_id = r.pid;
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'workforce_conflict' using detail = 'activity ' || r.id; end if;
  end loop;
end $$;

revoke all on function public.workforce_activities(text, text, bigint), public.workforce_save_activities(text, text, jsonb)
  from public, authenticated;
grant execute on function public.workforce_activities(text, text, bigint), public.workforce_save_activities(text, text, jsonb)
  to anon, service_role;
