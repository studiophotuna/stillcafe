-- Overtime minutes per task: asked when a member finishes a task after their shift
-- ended (or before it started). Replaces the snapshot/apply functions from 0004 to
-- read and write the new column; grants are unchanged.
--
-- Also lets members an admin allowed to upload tasks save them: a non-admin may now
-- update the team row's task counter, but still not its settings or fields.

alter table workforce.task add column if not exists ot_min int not null default 0 check (ot_min >= 0);

create or replace function public.workforce_snapshot(p_token text, p_team text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform workforce.session_person(p_token);
  return (
    select case when t.id is null then null else jsonb_build_object(
      'team', jsonb_build_object('settings', t.settings, 'fields', t.fields, 'seq', t.seq, 'mailCount', t.mail_count, 'version', t.version),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', k.id, 'trade', k.trade, 'title', k.title, 'pr', k.pr,
          'received', (extract(epoch from k.received_at) * 1000)::bigint,
          'source', k.source, 'status', k.status, 'assignee', k.assignee,
          'startedAt', (extract(epoch from k.started_at) * 1000)::bigint,
          'doneAt', (extract(epoch from k.done_at) * 1000)::bigint,
          'ot', k.ot, 'otMin', k.ot_min, 'hold', k.hold, 'fields', k.fields, 'email', k.email,
          'history', k.history, 'version', k.version) order by k.received_at)
        from workforce.task k where k.team_id = t.id), '[]'::jsonb)) end
    from (select p_team as want) w left join workforce.team t on t.id = w.want);
end $$;

create or replace function public.workforce_apply(p_token text, p_team text, p_changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me int := workforce.session_person(p_token);
  tm jsonb := p_changes -> 'team';
  tk record;
  n int;
begin
  if tm is not null then
    -- Non-admins (e.g. members uploading tasks) may move the task counter, not settings or fields.
    if (tm ->> 'version')::int <> 0 and not workforce.is_admin(me) and exists (
      select 1 from workforce.team t0 where t0.id = p_team
         and (t0.settings is distinct from tm -> 'settings' or t0.fields is distinct from tm -> 'fields'))
    then raise exception 'workforce_forbidden'; end if;
    if (tm ->> 'version')::int = 0 then
      insert into workforce.team (id, settings, fields, seq, mail_count)
      values (p_team, tm -> 'settings', tm -> 'fields', (tm ->> 'seq')::int, (tm ->> 'mailCount')::int)
      on conflict (id) do nothing;
    else
      update workforce.team
         set settings = tm -> 'settings', fields = tm -> 'fields', seq = (tm ->> 'seq')::int,
             mail_count = (tm ->> 'mailCount')::int, version = version + 1, updated_at = now()
       where id = p_team and version = (tm ->> 'version')::int;
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'workforce_conflict' using detail = 'team'; end if;
  end if;

  for tk in
    select * from jsonb_to_recordset(coalesce(p_changes -> 'tasks', '[]'::jsonb)) as x(
      id text, trade text, title text, pr text, received bigint, source text, status text,
      assignee int, "startedAt" bigint, "doneAt" bigint, ot boolean, "otMin" int, hold text,
      fields jsonb, email jsonb, history jsonb, version int)
  loop
    if tk.version = 0 then
      insert into workforce.task (team_id, id, trade, title, pr, received_at, source, status, assignee,
        started_at, done_at, ot, ot_min, hold, fields, email, history)
      values (p_team, tk.id, coalesce(tk.trade, ''), tk.title, tk.pr, to_timestamp(tk.received / 1000.0),
        tk.source, tk.status, tk.assignee, to_timestamp(tk."startedAt" / 1000.0), to_timestamp(tk."doneAt" / 1000.0),
        coalesce(tk.ot, false), greatest(coalesce(tk."otMin", 0), 0), coalesce(tk.hold, ''), coalesce(tk.fields, '{}'), tk.email, coalesce(tk.history, '[]'))
      on conflict (team_id, id) do nothing;
    else
      update workforce.task
         set trade = coalesce(tk.trade, ''), title = tk.title, pr = tk.pr, received_at = to_timestamp(tk.received / 1000.0),
             source = tk.source, status = tk.status, assignee = tk.assignee,
             started_at = to_timestamp(tk."startedAt" / 1000.0), done_at = to_timestamp(tk."doneAt" / 1000.0),
             ot = coalesce(tk.ot, false), ot_min = greatest(coalesce(tk."otMin", 0), 0), hold = coalesce(tk.hold, ''), fields = coalesce(tk.fields, '{}'),
             email = tk.email, history = coalesce(tk.history, '[]'), version = version + 1, updated_at = now()
       where team_id = p_team and id = tk.id and version = tk.version;
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'workforce_conflict' using detail = 'task ' || tk.id; end if;
  end loop;
exception
  when unique_violation then
    raise exception 'workforce_conflict' using detail = 'one task in progress per person';
end $$;

