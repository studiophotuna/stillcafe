-- Roles: Associate ("member"), Specialist, Sr. Specialist, Team lead, Manager, Director.
-- Only team leads, managers and directors lead people (approve overtime etc.), so the
-- check now names them instead of "anyone who isn't a member".
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
     where coalesce(me.p ->> 'level', 'member') in ('lead', 'manager', 'director')
       and exists (select 1 from jsonb_array_elements_text(me.p -> 'assign') a
                    where a in (select id from up) or a in (select id from down)));
$$;
revoke all on function workforce.is_leader_of(int, text) from public, anon, authenticated;
