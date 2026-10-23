-- A team's Workload without its whole history: open tasks, tasks finished in a time window,
-- and any tasks asked for by id. Finished tasks pile up every day, and the full snapshot sent
-- them all on every load. Pages that look further back (history, dashboard, business case)
-- ask for that window only. Also returns the first task's received time (when the team
-- started using Workload), which the dashboard needs and can no longer take from the tasks.
--
-- p_from / p_to: epoch ms; p_to null = no upper bound.

create or replace function public.workforce_snapshot_window(p_token text, p_team text, p_from bigint, p_to bigint, p_ids text[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f timestamptz := to_timestamp(coalesce(p_from, 0) / 1000.0);
  u timestamptz := case when p_to is null then 'infinity'::timestamptz else to_timestamp(p_to / 1000.0) end;
begin
  perform workforce.session_person(p_token);
  return (
    select case when t.id is null then null else jsonb_build_object(
      'team', jsonb_build_object('settings', t.settings, 'fields', t.fields, 'seq', t.seq, 'mailCount', t.mail_count, 'version', t.version),
      'first', (select (extract(epoch from min(k.received_at)) * 1000)::bigint from workforce.task k where k.team_id = t.id),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', k.id, 'trade', k.trade, 'title', k.title, 'pr', k.pr,
          'received', (extract(epoch from k.received_at) * 1000)::bigint,
          'source', k.source, 'status', k.status, 'assignee', k.assignee,
          'startedAt', (extract(epoch from k.started_at) * 1000)::bigint,
          'doneAt', (extract(epoch from k.done_at) * 1000)::bigint,
          'ot', k.ot, 'otMin', k.ot_min, 'ttype', k.ttype, 'slaH', k.sla_h, 'cx', k.cx, 'cxReview', k.cx_review, 'delay', k.delay, 'claim', k.claim, 'hold', k.hold, 'fields', k.fields, 'email', k.email,
          'history', k.history, 'version', k.version) order by k.received_at)
        from workforce.task k
        where k.team_id = t.id
          and (k.status <> 'done' or (k.done_at >= f and k.done_at < u) or k.id = any(coalesce(p_ids, '{}'::text[])))), '[]'::jsonb)) end
    from (select p_team as want) w left join workforce.team t on t.id = w.want);
end $$;

create index if not exists task_team_done on workforce.task (team_id, done_at);

revoke all on function public.workforce_snapshot_window(text, text, bigint, bigint, text[]) from public, authenticated;
grant execute on function public.workforce_snapshot_window(text, text, bigint, bigint, text[]) to anon, service_role;
