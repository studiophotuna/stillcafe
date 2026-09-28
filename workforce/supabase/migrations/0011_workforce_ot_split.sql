-- Overtime breakdown: at End work a member can say which process (trade, and task type)
-- the overtime was for, e.g. 2 h GPM and 3 h RCM. Stored with the end-of-day entry;
-- replaces the read/save functions from 0006 to include it. Grants are unchanged.

alter table workforce.activity add column if not exists ot_split jsonb
  check (ot_split is null or jsonb_typeof(ot_split) = 'array');

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
      'otSplit', a.ot_split,
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
      "decidedBy" int, "decidedAt" bigint, "otSplit" jsonb, version int, deleted boolean)
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
      insert into workforce.activity (team_id, id, person_id, kind, started_at, ended_at, ot_min, ot_status, decided_by, decided_at, ot_split)
      values (p_team, r.id, r.pid, r.kind, to_timestamp(r.start / 1000.0), to_timestamp(r."end" / 1000.0),
        greatest(coalesce(r."otMin", 0), 0), r."otStatus", r."decidedBy", to_timestamp(r."decidedAt" / 1000.0), r."otSplit")
      on conflict (team_id, id) do nothing;
    else
      update workforce.activity
         set kind = r.kind, started_at = to_timestamp(r.start / 1000.0), ended_at = to_timestamp(r."end" / 1000.0),
             ot_min = greatest(coalesce(r."otMin", 0), 0), ot_status = r."otStatus", decided_by = r."decidedBy",
             decided_at = to_timestamp(r."decidedAt" / 1000.0), ot_split = r."otSplit", version = version + 1, updated_at = now()
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
