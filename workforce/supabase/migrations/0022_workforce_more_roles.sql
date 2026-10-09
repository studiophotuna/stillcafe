-- Roles: Sr. Team Lead ("srlead") and Supervisor ("supervisor"), between Team lead and
-- Manager. Like team leads they lead people (approve overtime) and administer their own
-- teams by role, so both checks name them too.

create or replace function workforce.leads_team(pid int, p_team text) returns boolean
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
     where coalesce(me.p ->> 'level', 'member') in ('lead', 'srlead', 'supervisor', 'manager', 'director')
       and exists (select 1 from jsonb_array_elements_text(me.p -> 'assign') a
                    where a in (select id from up) or a in (select id from down)));
$$;
revoke all on function workforce.leads_team(int, text) from public, anon, authenticated;

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
         and p ->> 'level' in ('lead', 'srlead', 'supervisor', 'manager', 'director')
         and jsonb_array_length(coalesce(p -> 'assign', '[]'::jsonb)) > 0
         and (p ->> 'resign' is null or (p ->> 'resign')::date >= current_date));
$$;
