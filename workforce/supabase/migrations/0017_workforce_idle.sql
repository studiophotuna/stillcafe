-- Pausing a task logs an "idle" activity: the task timer stops, and the time counts as idle
-- (not deducted from the time available, so it lowers utilization).
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class t on t.oid = con.conrelid join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'workforce' and t.relname = 'activity' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%kind%training%'
  loop
    execute format('alter table workforce.activity drop constraint %I', c);
  end loop;
end $$;
alter table workforce.activity add constraint activity_kind_check
  check (kind in ('break', 'lunch', 'meeting', 'adhoc', 'training', 'idle', 'end'));
