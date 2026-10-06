-- Teams can allow several tasks in progress per member (Settings.oneAtATime = false).
-- The app enforces one at a time when the setting is on, so the database no longer does.
drop index if exists workforce.task_one_in_progress;
