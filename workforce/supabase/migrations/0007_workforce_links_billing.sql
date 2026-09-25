-- 1. Personal quick links (the Quick links bar): each person reads and writes only their own.
-- 2. Calendar save guard: the new "billing" (headcount report overrides) and "links"
--    (app-wide links such as BIPO) parts of the calendar document are admin-only too.

create table if not exists workforce.person_pref (
  person_id   int primary key,
  quick_links jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table workforce.person_pref enable row level security;
revoke all on workforce.person_pref from public, anon, authenticated;

create or replace function public.workforce_my_links(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me int := workforce.session_person(p_token);
begin
  return coalesce((select quick_links from workforce.person_pref where person_id = me), '[]'::jsonb);
end $$;

-- Up to 20 links of {label ≤ 40 chars, url https:// ≤ 500 chars}.
create or replace function public.workforce_set_my_links(p_token text, p_links jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me int := workforce.session_person(p_token);
begin
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 20 or exists (
    select 1 from jsonb_array_elements(p_links) l
     where jsonb_typeof(l) <> 'object' or length(coalesce(l ->> 'label', '')) not between 1 and 40
        or coalesce(l ->> 'url', '') !~ '^https://' or length(l ->> 'url') > 500)
  then raise exception 'workforce_bad_links'; end if;
  insert into workforce.person_pref (person_id, quick_links) values (me, p_links)
  on conflict (person_id) do update set quick_links = excluded.quick_links, updated_at = now();
end $$;

revoke all on function public.workforce_my_links(text), public.workforce_set_my_links(text, jsonb) from public, authenticated;
grant execute on function public.workforce_my_links(text), public.workforce_set_my_links(text, jsonb) to anon, service_role;

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
    foreach k in array array['people', 'nodes', 'overrides', 'roster', 'shifts', 'holidays', 'bcpEvents', 'billing', 'links'] loop
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

