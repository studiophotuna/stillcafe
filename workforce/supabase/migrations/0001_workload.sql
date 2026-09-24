-- Workload module schema (Postgres / Supabase).
-- Follows the data model in the design handoff (design_handoff_wfm/README.md). Shared org and
-- people tables are minimal here; the Calendar module will extend them.
-- Not yet wired to the app: the frontend currently runs on in-memory data
-- (src/lib/workload/store.tsx) with the same rules in src/lib/workload/engine.ts.

create type org_node_type as enum ('dept', 'tower', 'team', 'system', 'trade');
create type wl_mode as enum ('fifo', 'self', 'manual', 'rr');
create type wl_order as enum ('priority', 'received');
create type wl_priority as enum ('high', 'normal', 'low');
create type wl_status as enum ('new', 'assigned', 'in_progress', 'on_hold', 'done');
create type wl_source as enum ('upload', 'outlook');
create type wl_field_type as enum ('text', 'number', 'date', 'select');

-- ── shared ──
create table org_node (
  id uuid primary key default gen_random_uuid(),
  type org_node_type not null,
  name text not null,
  parent_id uuid references org_node (id) on delete restrict,
  sort int not null default 0
);

create table person (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null unique,
  entra_oid text unique,
  windows_username text,
  level text not null default 'member' check (level in ('member', 'team_lead', 'manager', 'director')),
  hire_date date,
  resign_date date
);

create table allocation (
  person_id uuid not null references person (id) on delete cascade,
  node_id uuid not null references org_node (id) on delete cascade,
  primary key (person_id, node_id)
);

create table team_admin (
  team_id uuid not null references org_node (id) on delete cascade,
  person_id uuid not null references person (id) on delete cascade,
  primary key (team_id, person_id)
);

-- ── workload ──
create table wl_team_settings (
  team_id uuid primary key references org_node (id) on delete cascade,
  mode wl_mode not null default 'fifo',
  order_rule wl_order not null default 'priority',
  skip_unavailable boolean not null default true,
  auto_feed boolean not null default true,
  sla_high_h numeric not null default 4,
  sla_normal_h numeric not null default 24,
  sla_low_h numeric not null default 72,
  shift_h numeric not null default 9,
  break1_min int not null default 60,
  break2_min int not null default 30,
  productive_h numeric not null default 6.8,
  intake_mailbox text,
  intake_default_trade_id uuid references org_node (id),
  graph_subscription_id text
);

create table wl_field (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references org_node (id) on delete cascade,
  key text not null,
  label text not null,
  type wl_field_type not null default 'text',
  options text[] not null default '{}',
  required boolean not null default false,
  is_metric boolean not null default false,
  sort int not null default 0,
  unique (team_id, key)
);

create table wl_target (
  team_id uuid not null references org_node (id) on delete cascade,
  trade_id uuid not null references org_node (id) on delete cascade,
  tasks_per_day numeric not null default 0,
  primary key (team_id, trade_id)
);

create table wl_member_target (
  person_id uuid primary key references person (id) on delete cascade,
  tasks_per_day numeric not null
);

create sequence task_no start 1040;

create table task (
  id text primary key default 'T-' || nextval('task_no'),
  team_id uuid not null references org_node (id),
  trade_id uuid references org_node (id),          -- null = "Needs trade"
  title text not null,
  priority wl_priority not null default 'normal',
  received_at timestamptz not null default now(),
  due_at timestamptz not null,                     -- received + SLA for the priority
  source wl_source not null,
  status wl_status not null default 'new',
  assignee_id uuid references person (id),
  started_at timestamptz,
  done_at timestamptz,
  overtime boolean not null default false,
  hold_reason text,
  fields jsonb not null default '{}'
);
create index task_queue_idx on task (team_id, trade_id, status, priority, due_at, received_at);
-- One task in progress per person.
create unique index task_one_in_progress on task (assignee_id) where status = 'in_progress';

create table task_email (
  task_id text primary key references task (id) on delete cascade,
  graph_message_id text unique,
  "from" text not null,
  cc text,
  subject text not null,
  body_html text,
  received_at timestamptz not null
);

create table task_attachment (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references task (id) on delete cascade,
  blob_url text not null,
  name text not null,
  size bigint
);

create table task_event (
  id bigint generated always as identity primary key,
  task_id text not null references task (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references person (id),
  action text not null,
  details jsonb not null default '{}'
);

-- "Start work" (FIFO): atomically claim the next task in the caller's trades.
-- SKIP LOCKED means two members pressing Start work at once never get the same task.
-- Availability (leave / rest day / off shift) must be checked by the caller.
create or replace function wl_start_work(p_person uuid, p_team uuid)
returns task language plpgsql as $$
declare
  s wl_team_settings;
  t task;
begin
  select * into s from wl_team_settings where team_id = p_team;
  if exists (select 1 from task where assignee_id = p_person and status = 'in_progress') then
    return null;
  end if;

  -- Tasks already assigned to the person come first.
  select * into t from task
   where team_id = p_team and assignee_id = p_person and status = 'assigned'
   order by case when s.order_rule = 'priority' then array_position(enum_range(null::wl_priority), priority) end,
            case when s.order_rule = 'priority' then due_at end,
            received_at
   limit 1 for update skip locked;

  if t.id is null and s.mode = 'fifo' then
    select * into t from task
     where team_id = p_team and status = 'new'
       and trade_id in (select node_id from allocation where person_id = p_person)
     order by case when s.order_rule = 'priority' then array_position(enum_range(null::wl_priority), priority) end,
              case when s.order_rule = 'priority' then due_at end,
              received_at
     limit 1 for update skip locked;
  end if;

  if t.id is null then
    return null;
  end if;

  update task set status = 'in_progress', assignee_id = p_person, started_at = now()
   where id = t.id returning * into t;
  insert into task_event (task_id, actor_id, action) values (t.id, p_person, 'started');
  return t;
end $$;
