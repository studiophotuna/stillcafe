-- Admin by role: directors administer their department, managers their tower and team
-- leads their team, without being listed as admins. The app scopes each to its part of the
-- org; the database guard (like listed admins) only checks that the person is an admin.
create or replace function workforce.is_admin(pid int) returns boolean
language sql stable set search_path = '' as $$
  select exists (
      select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'people') p
       where s.id = 'main' and (p ->> 'id')::int = pid and coalesce((p ->> 'sysAdmin')::boolean, false))
    or exists (
      select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'nodes') n
       where s.id = 'main' and coalesce(n -> 'admins', '[]'::jsonb) @> to_jsonb(pid))
    or exists (
      select 1 from workforce.cal_state s, jsonb_array_elements(s.data -> 'people') p
       where s.id = 'main' and (p ->> 'id')::int = pid
         and p ->> 'level' in ('lead', 'manager', 'director')
         and jsonb_array_length(coalesce(p -> 'assign', '[]'::jsonb)) > 0
         and (p ->> 'resign' is null or (p ->> 'resign')::date >= current_date));
$$;
