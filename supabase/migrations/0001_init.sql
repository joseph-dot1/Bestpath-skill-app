-- =============================================================================
-- Bestpath — initial schema (Milestone 0)
--
-- Ownership model:
--   * Learner-owned rows hang off `enrollments` (one user learning one skill).
--   * Curation tables (skills, topics, resources) are SHARED across all users —
--     personalization lives in the roadmap, curation quality is collective.
--   * AI-generated content (roadmaps, lessons, quizzes, resource pool writes)
--     is inserted by the server with the service-role key, which bypasses RLS.
--     User-facing policies therefore grant SELECT on owned rows and INSERT only
--     on rows users genuinely author (attempts, feedback, completions, events).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type skill_status      as enum ('seeded', 'pending', 'active', 'rejected');
create type resource_kind     as enum ('youtube', 'article', 'docs');
create type resource_status   as enum ('active', 'replaced', 'dead');
create type enrollment_status as enum ('active', 'completed', 'abandoned');
create type hydration_status  as enum ('skeleton', 'hydrating', 'hydrated');
create type plan_status       as enum ('on_track', 'behind', 'replanned', 'done');
create type insight_format    as enum ('text', 'video_link', 'audio_link');
create type subscription_tier as enum ('free', 'pro');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  country      text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Catalog & shared curation (no per-user data except feedback votes)
-- ---------------------------------------------------------------------------
create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  status     skill_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Canonical per-skill topic taxonomy. Roadmap generation must map every lesson
-- to a topic (reusing existing ones first) so curation is shared across users.
create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.skills (id) on delete cascade,
  slug       text not null,
  title      text not null,
  created_at timestamptz not null default now(),
  unique (skill_id, slug)
);

create table public.resources (
  id               uuid primary key default gen_random_uuid(),
  topic_id         uuid not null references public.topics (id) on delete cascade,
  kind             resource_kind not null,
  url              text not null,
  youtube_video_id text,                    -- set when kind = 'youtube'
  title            text not null,
  channel          text,
  published_at     timestamptz,
  stats            jsonb not null default '{}'::jsonb, -- views, likes, channel subs
  quality_score    numeric(6, 3) not null default 0,
  upvotes          integer not null default 0,
  downvotes        integer not null default 0,
  status           resource_status not null default 'active',
  last_verified_at timestamptz,
  created_at       timestamptz not null default now()
);

create index resources_topic_status_idx on public.resources (topic_id, status, quality_score desc);

create table public.resource_feedback (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  vote        smallint not null check (vote in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (user_id, resource_id)
);

-- ---------------------------------------------------------------------------
-- Per-learner: enrollment -> roadmap -> levels -> modules -> lessons
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  skill_id              uuid not null references public.skills (id),
  goal                  text,               -- job | freelance | hobby | certification (free text from assessment)
  weekly_hours          integer,
  prior_level           text,
  format_pref           text,               -- video-heavy | reading | project-based mix
  assessment_transcript jsonb not null default '[]'::jsonb,
  status                enrollment_status not null default 'active',
  created_at            timestamptz not null default now(),
  unique (user_id, skill_id)
);

create table public.roadmaps (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  version       integer not null default 1,
  model_used    text,
  generated_at  timestamptz not null default now(),
  unique (enrollment_id, version)
);

create table public.levels (
  id         uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  index      integer not null,               -- 0 Beginner .. 3 Professional
  name       text not null,
  is_free    boolean not null default false, -- Beginner level is free
  unique (roadmap_id, index)
);

create table public.modules (
  id               uuid primary key default gen_random_uuid(),
  level_id         uuid not null references public.levels (id) on delete cascade,
  index            integer not null,
  title            text not null,
  objectives       jsonb not null default '[]'::jsonb,
  est_hours        numeric(5, 1),
  hydration_status hydration_status not null default 'skeleton',
  unique (level_id, index)
);

create table public.lessons (
  id        uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  index     integer not null,
  title     text not null,
  topic_id  uuid references public.topics (id),
  summary   text,
  unique (module_id, index)
);

create table public.lesson_resources (
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  rank        integer not null,
  primary key (lesson_id, resource_id)
);

-- ---------------------------------------------------------------------------
-- Learning loop
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id        uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.modules (id) on delete cascade,
  questions jsonb not null default '[]'::jsonb
);

create table public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  answers    jsonb not null default '[]'::jsonb,
  score      numeric(5, 2) not null,
  created_at timestamptz not null default now()
);

create table public.checkpoints (
  id       uuid primary key default gen_random_uuid(),
  level_id uuid not null unique references public.levels (id) on delete cascade,
  brief    text not null,
  rubric   jsonb not null default '[]'::jsonb
);

create table public.checkpoint_submissions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  checkpoint_id     uuid not null references public.checkpoints (id) on delete cascade,
  description       text not null,
  media_url         text,
  ai_feedback       text,
  self_certified_at timestamptz,
  created_at        timestamptz not null default now()
);

create table public.lesson_completions (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.weekly_plans (
  id                 uuid primary key default gen_random_uuid(),
  enrollment_id      uuid not null references public.enrollments (id) on delete cascade,
  week_index         integer not null,
  planned_lesson_ids jsonb not null default '[]'::jsonb,
  status             plan_status not null default 'on_track',
  unique (enrollment_id, week_index)
);

-- ---------------------------------------------------------------------------
-- Business & ops
-- ---------------------------------------------------------------------------
create table public.pro_insights (
  id           uuid primary key default gen_random_uuid(),
  skill_id     uuid not null references public.skills (id) on delete cascade,
  author_name  text not null,
  author_title text not null,
  author_photo_url text,
  format       insight_format not null default 'text',
  body         text not null,               -- text content, or the external link
  is_premium   boolean not null default false,
  published_at timestamptz,                 -- null = draft
  created_at   timestamptz not null default now()
);

create table public.subscriptions (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  tier         subscription_tier not null default 'free',
  status       text not null default 'active',
  provider     text,                        -- paystack | stripe (v1.1)
  provider_ref text,
  updated_at   timestamptz not null default now()
);

create table public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_name_created_idx on public.events (name, created_at);

-- Service-role only: daily API budget guardrail.
create table public.api_usage (
  day              date primary key,
  youtube_units    integer not null default 0,
  anthropic_tokens jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so nested ownership checks skip chained RLS)
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create function public.owns_enrollment(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from enrollments where id = eid and user_id = auth.uid());
$$;

create function public.owns_roadmap(rid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from roadmaps r join enrollments e on e.id = r.enrollment_id
    where r.id = rid and e.user_id = auth.uid()
  );
$$;

create function public.owns_level(lid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from levels l
    join roadmaps r on r.id = l.roadmap_id
    join enrollments e on e.id = r.enrollment_id
    where l.id = lid and e.user_id = auth.uid()
  );
$$;

create function public.owns_module(mid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from modules m
    join levels l on l.id = m.level_id
    join roadmaps r on r.id = l.roadmap_id
    join enrollments e on e.id = r.enrollment_id
    where m.id = mid and e.user_id = auth.uid()
  );
$$;

create function public.owns_lesson(lsid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from lessons ls
    join modules m on m.id = ls.module_id
    join levels l on l.id = m.level_id
    join roadmaps r on r.id = l.roadmap_id
    join enrollments e on e.id = r.enrollment_id
    where ls.id = lsid and e.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.skills                 enable row level security;
alter table public.topics                 enable row level security;
alter table public.resources              enable row level security;
alter table public.resource_feedback      enable row level security;
alter table public.enrollments            enable row level security;
alter table public.roadmaps               enable row level security;
alter table public.levels                 enable row level security;
alter table public.modules                enable row level security;
alter table public.lessons                enable row level security;
alter table public.lesson_resources       enable row level security;
alter table public.quizzes                enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.checkpoints            enable row level security;
alter table public.checkpoint_submissions enable row level security;
alter table public.lesson_completions     enable row level security;
alter table public.weekly_plans           enable row level security;
alter table public.pro_insights           enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.events                 enable row level security;
alter table public.api_usage              enable row level security; -- no policies: service role only

create policy "own profile: read"   on public.profiles for select using (id = auth.uid());
create policy "own profile: update" on public.profiles for update using (id = auth.uid());

-- Catalog is world-readable (landing page shows skills before sign-in).
create policy "skills: public read" on public.skills for select using (true);
create policy "topics: read"        on public.topics for select to authenticated using (true);
create policy "resources: read"     on public.resources for select to authenticated using (true);

create policy "feedback: insert own" on public.resource_feedback for insert to authenticated
  with check (user_id = auth.uid());
create policy "feedback: read own"   on public.resource_feedback for select using (user_id = auth.uid());
create policy "feedback: update own" on public.resource_feedback for update using (user_id = auth.uid());

create policy "enrollments: insert own" on public.enrollments for insert to authenticated
  with check (user_id = auth.uid());
create policy "enrollments: read own"   on public.enrollments for select using (user_id = auth.uid());
create policy "enrollments: update own" on public.enrollments for update using (user_id = auth.uid());

create policy "roadmaps: read own" on public.roadmaps for select using (owns_enrollment(enrollment_id));
create policy "levels: read own"   on public.levels   for select using (owns_roadmap(roadmap_id));
create policy "modules: read own"  on public.modules  for select using (owns_level(level_id));
create policy "lessons: read own"  on public.lessons  for select using (owns_module(module_id));
create policy "lesson_resources: read own" on public.lesson_resources for select using (owns_lesson(lesson_id));
create policy "quizzes: read own"     on public.quizzes     for select using (owns_module(module_id));
create policy "checkpoints: read own" on public.checkpoints for select using (owns_level(level_id));

create policy "quiz_attempts: insert own" on public.quiz_attempts for insert to authenticated
  with check (user_id = auth.uid());
create policy "quiz_attempts: read own" on public.quiz_attempts for select using (user_id = auth.uid());

create policy "submissions: insert own" on public.checkpoint_submissions for insert to authenticated
  with check (user_id = auth.uid());
create policy "submissions: read own"   on public.checkpoint_submissions for select using (user_id = auth.uid());
create policy "submissions: update own" on public.checkpoint_submissions for update using (user_id = auth.uid());

create policy "completions: insert own" on public.lesson_completions for insert to authenticated
  with check (user_id = auth.uid());
create policy "completions: read own"   on public.lesson_completions for select using (user_id = auth.uid());
create policy "completions: delete own" on public.lesson_completions for delete using (user_id = auth.uid());

create policy "weekly_plans: read own" on public.weekly_plans for select using (owns_enrollment(enrollment_id));

-- Published insights are readable by signed-in users; premium body gating is
-- enforced at the app layer in MVP (locked card UI). Admins manage content.
create policy "insights: read published" on public.pro_insights for select to authenticated
  using (published_at is not null or is_admin());
create policy "insights: admin insert" on public.pro_insights for insert to authenticated
  with check (is_admin());
create policy "insights: admin update" on public.pro_insights for update using (is_admin());
create policy "insights: admin delete" on public.pro_insights for delete using (is_admin());

create policy "subscriptions: read own" on public.subscriptions for select using (user_id = auth.uid());

create policy "events: insert own" on public.events for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Seed data: the ten launch skills
-- ---------------------------------------------------------------------------
insert into public.skills (slug, title, status) values
  ('video-editing',            'Video Editing',              'seeded'),
  ('meta-google-ads',          'Meta & Google Ads',          'seeded'),
  ('copywriting',              'Copywriting',                'seeded'),
  ('graphic-design',           'Graphic Design',             'seeded'),
  ('data-analysis',            'Data Analysis',              'seeded'),
  ('frontend-development',     'Frontend Development',       'seeded'),
  ('ui-ux-design',             'UI/UX Design',               'seeded'),
  ('social-media-management',  'Social Media Management',    'seeded'),
  ('vibe-coding',              'Vibe Coding',                'seeded'),
  ('ai-prompt-engineering',    'AI & Prompt Engineering',    'seeded');
