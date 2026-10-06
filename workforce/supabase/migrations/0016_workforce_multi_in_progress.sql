-- One task in progress per member stays a database rule. Recreates the index for anyone who
-- dropped it while multi in-progress was briefly an option (no-op otherwise).
create unique index if not exists task_one_in_progress on workforce.task (team_id, assignee) where status = 'in_progress';
