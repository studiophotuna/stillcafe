-- Email + password sign-in, and every data function requires a signed-in session.
--
-- Accounts are created by admins (temporary password, must be changed at first
-- sign-in). Passwords are bcrypt-hashed (pgcrypto); sessions are random tokens
-- stored as SHA-256 hashes, valid 12 hours. Five wrong passwords lock the
-- account for 15 minutes.
--
-- Replaces the open functions from 0001–0003 (dropped below). Admin rights come
-- from the calendar document: a person with "sysAdmin": true, or listed in any
-- team's "admins". The database refuses non-admin changes to people, org,
-- settings, shifts, holidays, schedules and BCP events, and to Workload settings.

create table workforce.account (
  email       text primary key check (email = lower(email)),
  person_id   int not null unique,
  pw_hash     text not null,
  must_change boolean not null default true,
  failed      int not null default 0,
  locked_until timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table workforce.session (
  token_hash  text primary key,
  email       text not null references workforce.account (email) on delete cascade on update cascade,
  person_id   int not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table workforce.account enable row level security;
alter table workforce.session enable row level security;
revoke all on workforce.account, workforce.session from public, anon, authenticated;

-- ── helpers (not callable through the API) ──
create or replace function workforce.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Person id for a valid session, else raises workforce_unauthorized.
create or replace function workforce.session_person(p_token text) returns int
language plpgsql stable set search_path = '' as $$
declare pid int;
begin
  select s.person_id into pid from workforce.session s
   where s.token_hash = workforce.token_hash(p_token) and s.expires_at > now();
  if pid is null then raise exception 'workforce_unauthorized'; end if;
  return pid;
end $$;

create or replace function workforce.is_admin(pid int) returns boolean
language sql stable set search_path = '' as $$
  select exists (
      select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'people') p
       where s.id = 'main' and (p ->> 'id')::int = pid and coalesce((p ->> 'sysAdmin')::boolean, false))
    or exists (
      select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'nodes') n
       where s.id = 'main' and coalesce(n -> 'admins', '[]'::jsonb) @> to_jsonb(pid));
$$;

-- System admins: full rights. Only another system admin may change them (or their email).
create or replace function workforce.is_sys(pid int) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'people') p
     where s.id = 'main' and (p ->> 'id')::int = pid and coalesce((p ->> 'sysAdmin')::boolean, false));
$$;

-- The system admins in a calendar document, as [[id, email], …] sorted by id.
create or replace function workforce.sys_people(doc jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(p -> 'id', lower(p ->> 'email')) order by (p ->> 'id')::int), '[]'::jsonb)
    from jsonb_array_elements(coalesce(doc -> 'people', '[]'::jsonb)) p
   where coalesce((p ->> 'sysAdmin')::boolean, false);
$$;

revoke all on function workforce.token_hash(text), workforce.session_person(text), workforce.is_admin(int),
  workforce.is_sys(int), workforce.sys_people(jsonb) from public, anon, authenticated;

-- ── sign-in ──
create or replace function public.workforce_login(p_email text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a workforce.account;
  tok text;
begin
  select * into a from workforce.account where email = lower(trim(p_email));
  if a.email is null then
    perform extensions.crypt(coalesce(p_password, ''), extensions.gen_salt('bf', 10)); -- same cost as a real check
    return null;
  end if;
  if a.locked_until is not null and a.locked_until > now() then
    raise exception 'workforce_locked';
  end if;
  if a.pw_hash <> extensions.crypt(coalesce(p_password, ''), a.pw_hash) then
    update workforce.account
       set failed = case when failed + 1 >= 5 then 0 else failed + 1 end,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end
     where email = a.email;
    return null;
  end if;
  update workforce.account set failed = 0, locked_until = null where email = a.email;
  delete from workforce.session where expires_at < now();
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into workforce.session (token_hash, email, person_id, expires_at)
  values (workforce.token_hash(tok), a.email, a.person_id, now() + interval '12 hours');
  return jsonb_build_object('token', tok, 'personId', a.person_id, 'email', a.email, 'mustChange', a.must_change);
end $$;

create or replace function public.workforce_session(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('personId', s.person_id, 'email', s.email, 'mustChange', a.must_change)
    from workforce.session s join workforce.account a on a.email = s.email
   where s.token_hash = workforce.token_hash(p_token) and s.expires_at > now();
$$;

create or replace function public.workforce_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from workforce.session where token_hash = workforce.token_hash(p_token);
$$;

create or replace function public.workforce_change_password(p_token text, p_old text, p_new text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  pid int := workforce.session_person(p_token);
  a workforce.account;
begin
  select * into a from workforce.account where person_id = pid;
  if a.email is null or a.pw_hash <> extensions.crypt(coalesce(p_old, ''), a.pw_hash) then return false; end if;
  if length(coalesce(p_new, '')) < 10 or p_new !~ '[A-Za-z]' or p_new !~ '[0-9]' or p_new = p_old then
    raise exception 'workforce_weak_password';
  end if;
  update workforce.account
     set pw_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), must_change = false, updated_at = now()
   where email = a.email;
  -- sign out other sessions
  delete from workforce.session where email = a.email and token_hash <> workforce.token_hash(p_token);
  return true;
end $$;

-- Admin: create or reset a person's sign-in with a temporary password.
create or replace function public.workforce_set_login(p_token text, p_email text, p_person_id int, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me int := workforce.session_person(p_token);
  em text := lower(trim(p_email));
  other int;
begin
  if not workforce.is_admin(me) then raise exception 'workforce_forbidden'; end if;
  if workforce.is_sys(p_person_id) and not workforce.is_sys(me) then raise exception 'workforce_forbidden'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'workforce_bad_email'; end if;
  if length(coalesce(p_password, '')) < 10 then raise exception 'workforce_weak_password'; end if;
  select person_id into other from workforce.account where email = em;
  if other is not null and other <> p_person_id then raise exception 'workforce_email_taken'; end if;
  delete from workforce.account where person_id = p_person_id and email <> em;
  insert into workforce.account (email, person_id, pw_hash, must_change)
  values (em, p_person_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), true)
  on conflict (email) do update
     set pw_hash = excluded.pw_hash, must_change = true, failed = 0, locked_until = null, updated_at = now();
  delete from workforce.session where person_id = p_person_id;
end $$;

-- Admin: remove a person's sign-in (e.g. after they leave).
create or replace function public.workforce_remove_login(p_token text, p_person_id int) returns void
language plpgsql security definer set search_path = '' as $$
declare me int := workforce.session_person(p_token);
begin
  if not workforce.is_admin(me) then raise exception 'workforce_forbidden'; end if;
  if workforce.is_sys(p_person_id) and not workforce.is_sys(me) then raise exception 'workforce_forbidden'; end if;
  delete from workforce.account where person_id = p_person_id;
end $$;

-- Which people have a sign-in (admin screens).
create or replace function public.workforce_logins(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me int := workforce.session_person(p_token);
begin
  if not workforce.is_admin(me) then raise exception 'workforce_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('personId', person_id, 'email', email, 'mustChange', must_change))
                     from workforce.account), '[]'::jsonb);
end $$;

-- ── data functions, now session-gated ──
drop function if exists public.workforce_snapshot(text);
drop function if exists public.workforce_apply(text, jsonb);
drop function if exists public.workforce_cal_snapshot(text);
drop function if exists public.workforce_cal_save(text, jsonb, int);

create or replace function public.workforce_cal_snapshot(p_token text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform workforce.session_person(p_token);
  return (select jsonb_build_object('data', s.data, 'version', s.version) from workforce.cal_state s where s.id = p_id);
end $$;

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
    foreach k in array array['people', 'nodes', 'overrides', 'roster', 'shifts', 'holidays', 'bcpEvents'] loop
      if (old -> k) is distinct from (p_data -> k) then raise exception 'workforce_forbidden' using detail = k; end if;
    end loop;
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
          'ot', k.ot, 'hold', k.hold, 'fields', k.fields, 'email', k.email,
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
    if (tm ->> 'version')::int <> 0 and not workforce.is_admin(me) then raise exception 'workforce_forbidden'; end if;
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
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'workforce_login(text,text)', 'workforce_session(text)', 'workforce_logout(text)',
    'workforce_change_password(text,text,text)', 'workforce_set_login(text,text,int,text)',
    'workforce_remove_login(text,int)', 'workforce_logins(text)',
    'workforce_cal_snapshot(text,text)', 'workforce_cal_save(text,text,jsonb,int)',
    'workforce_snapshot(text,text)', 'workforce_apply(text,text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon, service_role', f);
  end loop;
end $$;
