-- Trusted creators per skill — the "professional in the loop" registry.
-- The curation pipeline searches these creators' content FIRST for every
-- lesson and boosts them in ranking. 'approved' = vetted by an admin (the
-- strongest signal); 'suggested' = proposed by AI, still guides search until
-- reviewed; 'rejected' = never surface this creator for this skill.
create table public.skill_creators (
  id                 uuid primary key default gen_random_uuid(),
  skill_id           uuid not null references public.skills (id) on delete cascade,
  channel_name       text not null,   -- as searched, e.g. "Latasha James"
  youtube_channel_id text,            -- resolved lazily from search results
  note               text,            -- why they're trusted (AI rationale or admin note)
  status             text not null default 'suggested'
                     check (status in ('suggested', 'approved', 'rejected')),
  source             text not null default 'ai'
                     check (source in ('ai', 'admin')),
  created_at         timestamptz not null default now(),
  unique (skill_id, channel_name)
);

alter table public.skill_creators enable row level security;

-- Admins manage the registry from the app; the pipeline reads/writes with the
-- service role (bypasses RLS).
create policy "skill_creators: admin read"
  on public.skill_creators for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- "Professional toolkit" topics (slug prefix 'toolkit-') describe adjacent
-- competencies; the description holds why the competency matters.
alter table public.topics add column if not exists description text;
