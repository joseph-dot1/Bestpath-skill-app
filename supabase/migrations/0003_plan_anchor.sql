-- The weekly plan's week-0 anchor. Reset by the replan mechanic so week math
-- restarts without touching the enrollment's true creation date.
alter table public.enrollments
  add column plan_started_at timestamptz not null default now();
