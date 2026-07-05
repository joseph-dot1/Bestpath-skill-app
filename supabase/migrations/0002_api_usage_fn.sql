-- A resource URL appears at most once per topic (curation upserts rely on it).
alter table public.resources
  add constraint resources_topic_url_unique unique (topic_id, url);

-- Atomic daily YouTube quota accounting (called with the service role).
create function public.increment_youtube_units(units integer)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into api_usage (day, youtube_units)
  values (current_date, units)
  on conflict (day)
  do update set youtube_units = api_usage.youtube_units + excluded.youtube_units
  returning youtube_units;
$$;

-- Atomic feedback counter adjustment (service role; deltas can be negative
-- when a user changes their vote).
create function public.adjust_resource_votes(
  rid uuid,
  up_delta integer,
  down_delta integer
)
returns table (up integer, down integer)
language sql
security definer
set search_path = public
as $$
  update resources
  set upvotes   = greatest(0, upvotes + up_delta),
      downvotes = greatest(0, downvotes + down_delta)
  where id = rid
  returning upvotes, downvotes;
$$;
