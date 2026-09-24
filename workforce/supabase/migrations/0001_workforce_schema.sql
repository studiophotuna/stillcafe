-- Workload module storage, in its own `workforce` schema so it stays separate from
-- the stillcafe site's tables in the same database.
--
-- Access model: the schema is not exposed to the Supabase API roles. The app's
-- server (Next.js route handlers, holding the project's secret key) calls two
-- SECURITY DEFINER functions in `public`, executable by service_role only:
--   workforce_snapshot(team)          → team settings + all tasks as JSON
--   workforce_apply(team, changes)    → atomic write with optimistic version checks
-- The Workload rules run on the server (src/lib/workload/engine.ts); the
-- database guarantees consistency (versions, one task in progress per person).
-- Timestamps travel as epoch milliseconds to match the app's types.

create schema if not exists workforce;
revoke all on schema workforce from public, anon, authenticated;

create table workforce.team (
  id          text primary key,
  settings    jsonb not null,
  fields      jsonb not null,
  seq         int not null default 2000,
  mail_count  int not null default 0,
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);

create table workforce.task (
  team_id     text not null references workforce.team (id) on delete cascade,
  id          text not null,
  trade       text not null default '',          -- '' = needs trade
  title       text not null,
  pr          text not null check (pr in ('high', 'normal', 'low')),
  received_at timestamptz not null,
  source      text not null check (source in ('outlook', 'upload')),
  status      text not null check (status in ('new', 'assigned', 'in_progress', 'on_hold', 'done')),
  assignee    int,
  started_at  timestamptz,
  done_at     timestamptz,
  ot          boolean not null default false,
  hold        text not null default '',
  fields      jsonb not null default '{}',
  email       jsonb,
  history     jsonb not null default '[]',
  version     int not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (team_id, id)
);
create index task_team_status_idx on workforce.task (team_id, status);
-- One task in progress per person.
create unique index task_one_in_progress on workforce.task (team_id, assignee) where status = 'in_progress';

alter table workforce.team enable row level security;
alter table workforce.task enable row level security;
revoke all on all tables in schema workforce from public, anon, authenticated;

-- ── read ──
create or replace function public.workforce_snapshot(p_team text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.id is null then null else jsonb_build_object(
    'team', jsonb_build_object(
      'settings', t.settings, 'fields', t.fields, 'seq', t.seq,
      'mailCount', t.mail_count, 'version', t.version),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'trade', k.trade, 'title', k.title, 'pr', k.pr,
        'received', (extract(epoch from k.received_at) * 1000)::bigint,
        'source', k.source, 'status', k.status, 'assignee', k.assignee,
        'startedAt', (extract(epoch from k.started_at) * 1000)::bigint,
        'doneAt', (extract(epoch from k.done_at) * 1000)::bigint,
        'ot', k.ot, 'hold', k.hold, 'fields', k.fields, 'email', k.email,
        'history', k.history, 'version', k.version) order by k.received_at)
      from workforce.task k where k.team_id = t.id), '[]'::jsonb)
  ) end
  from (select p_team as want) w
  left join workforce.team t on t.id = w.want;
$$;

-- ── write ──
-- p_changes = { team?: {settings, fields, seq, mailCount, version}, tasks?: [task + version] }
-- `version` is the version the caller read (0 = new row). Any mismatch, or a second
-- in-progress task for one person, raises 'workforce_conflict' and nothing is written.
create or replace function public.workforce_apply(p_team text, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tm jsonb := p_changes -> 'team';
  tk record;
  n int;
begin
  if tm is not null then
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
      assignee int, "startedAt" bigint, "doneAt" bigint, ot boolean, hold text,
      fields jsonb, email jsonb, history jsonb, version int)
  loop
    if tk.version = 0 then
      insert into workforce.task (team_id, id, trade, title, pr, received_at, source, status, assignee,
        started_at, done_at, ot, hold, fields, email, history)
      values (p_team, tk.id, coalesce(tk.trade, ''), tk.title, tk.pr, to_timestamp(tk.received / 1000.0),
        tk.source, tk.status, tk.assignee, to_timestamp(tk."startedAt" / 1000.0), to_timestamp(tk."doneAt" / 1000.0),
        coalesce(tk.ot, false), coalesce(tk.hold, ''), coalesce(tk.fields, '{}'), tk.email, coalesce(tk.history, '[]'))
      on conflict (team_id, id) do nothing;
    else
      update workforce.task
         set trade = coalesce(tk.trade, ''), title = tk.title, pr = tk.pr, received_at = to_timestamp(tk.received / 1000.0),
             source = tk.source, status = tk.status, assignee = tk.assignee,
             started_at = to_timestamp(tk."startedAt" / 1000.0), done_at = to_timestamp(tk."doneAt" / 1000.0),
             ot = coalesce(tk.ot, false), hold = coalesce(tk.hold, ''), fields = coalesce(tk.fields, '{}'),
             email = tk.email, history = coalesce(tk.history, '[]'), version = version + 1, updated_at = now()
       where team_id = p_team and id = tk.id and version = tk.version;
    end if;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'workforce_conflict' using detail = 'task ' || tk.id; end if;
  end loop;
exception
  when unique_violation then
    raise exception 'workforce_conflict' using detail = 'one task in progress per person';
end;
$$;

revoke all on function public.workforce_snapshot(text) from public, anon, authenticated;
revoke all on function public.workforce_apply(text, jsonb) from public, anon, authenticated;
grant execute on function public.workforce_snapshot(text) to service_role;
grant execute on function public.workforce_apply(text, jsonb) to service_role;
