-- Overtime types and rest day OT.
-- * activity.ot_kind: an end-of-day entry whose whole day was overtime — "holiday"
--   (holiday duty) or "restday" (a weekend / rest day worked). Replaces the activity
--   read/save functions from 0011 to include it.
-- * Calendar save guard: besides their own holidays, members may tag their own weekend
--   days as RDOT (rest day overtime) when they start working it.

alter table workforce.activity add column if not exists ot_kind text check (ot_kind is null or ot_kind in ('holiday', 'restday'));

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
      'otSplit', a.ot_split, 'otKind', a.ot_kind,
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
      "decidedBy" int, "decidedAt" bigint, "otSplit" jsonb, "otKind" text, version int, deleted boolean)
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
      insert into workforce.activity (team_id, id, person_id, kind, started_at, ended_at, ot_min, ot_status, decided_by, decided_at, ot_split, ot_kind)
      values (p_team, r.id, r.pid, r.kind, to_timestamp(r.start / 1000.0), to_timestamp(r."end" / 1000.0),
        greatest(coalesce(r."otMin", 0), 0), r."otStatus", r."decidedBy", to_timestamp(r."decidedAt" / 1000.0), r."otSplit", r."otKind")
      on conflict (team_id, id) do nothing;
    else
      update workforce.activity
         set kind = r.kind, started_at = to_timestamp(r.start / 1000.0), ended_at = to_timestamp(r."end" / 1000.0),
             ot_min = greatest(coalesce(r."otMin", 0), 0), ot_status = r."otStatus", decided_by = r."decidedBy",
             decided_at = to_timestamp(r."decidedAt" / 1000.0), ot_split = r."otSplit", ot_kind = r."otKind", version = version + 1, updated_at = now()
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

-- Overrides without the person's own holiday days and their own weekend days tagged RDOT.
create or replace function workforce.overrides_but_own_days(ov jsonb, pid int, hol jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(ov, '{}'::jsonb)) e
   where not (split_part(e.key, '|', 1) = pid::text
              and (split_part(e.key, '|', 2) in (select h ->> 'date' from jsonb_array_elements(coalesce(hol, '[]'::jsonb)) h)
                   or (e.value = '"RDOT"'::jsonb and extract(isodow from split_part(e.key, '|', 2)::date) in (6, 7))));
$$;
revoke all on function workforce.overrides_but_own_days(jsonb, int, jsonb) from public, anon, authenticated;

create or replace function public.workforce_cal_save(p_token text, p_id text, p_data jsonb, p_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me int := workforce.session_person(p_token);
  old jsonb;
  v int;
  k text;
begin
  select data into old from workforce.cal_state where id = p_id;
  if not workforce.is_admin(me) then
    if old is null then raise exception 'workforce_forbidden'; end if;
    foreach k in array array['people', 'nodes', 'roster', 'shifts', 'holidays', 'bcpEvents', 'billing', 'links'] loop
      if (old -> k) is distinct from (p_data -> k) then raise exception 'workforce_forbidden' using detail = k; end if;
    end loop;
    if workforce.overrides_but_own_days(old -> 'overrides', me, old -> 'holidays')
       is distinct from workforce.overrides_but_own_days(p_data -> 'overrides', me, old -> 'holidays')
       or exists (select 1 from jsonb_each(coalesce(p_data -> 'overrides', '{}'::jsonb)) e
                   where split_part(e.key, '|', 1) = me::text
                     and (old -> 'overrides' -> e.key) is distinct from e.value
                     and not (e.value = '"RDOT"'::jsonb and extract(isodow from split_part(e.key, '|', 2)::date) in (6, 7))
                     and e.value not in ('"RTO"'::jsonb, '"WFH"'::jsonb, '"HOL"'::jsonb)) then
      raise exception 'workforce_forbidden' using detail = 'overrides';
    end if;
  end if;
  if old is not null and not workforce.is_sys(me) and workforce.sys_people(old) is distinct from workforce.sys_people(p_data) then
    raise exception 'workforce_forbidden' using detail = 'sysAdmin';
  end if;
  if p_version = 0 then
    insert into workforce.cal_state (id, data) values (p_id, p_data) on conflict (id) do nothing returning version into v;
  else
    update workforce.cal_state set data = p_data, version = version + 1, updated_at = now()
     where id = p_id and version = p_version returning version into v;
  end if;
  if v is null then raise exception 'workforce_conflict' using detail = 'calendar'; end if;
  return v;
end $$;
