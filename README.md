# Bestpath

Type any skill. Get a personalized beginner-to-professional roadmap where every
resource is real, verified, and ranked by learner outcomes — with insights from
working professionals you won't find on YouTube.

## Stack

- **Next.js** (App Router) · TypeScript · Tailwind CSS — dark-mode-first, mobile-first
- **Supabase** — auth, Postgres with row-level security, storage
- **Anthropic API** — assessment, roadmap generation, quizzes, checkpoint feedback
- **YouTube Data API v3** — resource verification & ranking
- **Resend** — email nudges

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then
   apply the schema. Either paste `supabase/migrations/0001_init.sql` into the
   SQL Editor, or use the CLI:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. **Enable auth providers** in the Supabase dashboard (Authentication → Providers):
   - **Email** (OTP codes — enabled by default)
   - **Google** (optional but recommended): add your OAuth client ID/secret and
     set the redirect URL to `<your-site>/auth/callback`

4. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API). The remaining keys are needed in later milestones.

5. **Run the app**

   ```bash
   npm run dev
   ```

## Architecture notes

- **Shared curation:** resources are curated per skill *topic* and shared by all
  learners; thumbs up/down feedback improves the pool for everyone. The
  personalization lives in the roadmap structure and pacing.
- **Lazy hydration:** roadmap skeletons generate at enrollment; lesson detail
  and verified resources hydrate one module ahead of the learner. This keeps
  Anthropic costs and YouTube API quota sane.
- **RLS:** learner data is protected with row-level security. AI-generated
  writes (roadmaps, lessons, resource pool) happen server-side with the service
  role key.

## Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Foundation — scaffold, schema + RLS, auth, dark UI shell | ✅ |
| M1 | Adaptive assessment → learner profile | ✅ |
| M2 | Roadmap skeleton generation + overview UI + weekly plan | ⬜ |
| M3 | Resource pipeline (YouTube verify + rank) + module UI | ⬜ |
| M4 | Learning loop — quizzes, checkpoints, progress | ⬜ |
| M5 | Retention — dashboard, replan, email nudges, events | ⬜ |
| M6 | Pro Insights + free/paid gating | ⬜ |
| M7 | Pilot polish — low-bandwidth pass, PWA, QA across seed skills | ⬜ |
