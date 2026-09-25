-- Members may mark themselves working on a holiday (holiday duty). The calendar save
-- guard still keeps "overrides" admin-only, except a member's own days that are
-- holidays, which they may set to RTO or WFH or clear.

-- Overrides without the person's own holiday days.
create or replace function workforce.overrides_but_own_hol(ov jsonb, pid int, hol jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(ov, '{}'::jsonb)) e
   where not (split_part(e.key, '|', 1) = pid::text
              and split_part(e.key, '|', 2) in (select h ->> 'date' from jsonb_array_elements(coalesce(hol, '[]'::jsonb)) h));
$$;
revoke all on function workforce.overrides_but_own_hol(jsonb, int, jsonb) from public, anon, authenticated;

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
    if workforce.overrides_but_own_hol(old -> 'overrides', me, old -> 'holidays')
       is distinct from workforce.overrides_but_own_hol(p_data -> 'overrides', me, old -> 'holidays')
       or exists (select 1 from jsonb_each(coalesce(p_data -> 'overrides', '{}'::jsonb)) e
                   where split_part(e.key, '|', 1) = me::text and e.value not in ('"RTO"'::jsonb, '"WFH"'::jsonb)
                     and (old -> 'overrides' -> e.key) is distinct from e.value) then
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
