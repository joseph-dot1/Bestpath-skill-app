# Bestpath — Setup Guide (100% free stack)

Everything runs on free tiers: Supabase, Vercel Hobby, Google Gemini,
YouTube Data API, and Resend. No card required anywhere.

## Part 1 — Run the code locally

Requires Node.js 20+.

```bash
git clone https://github.com/joseph-dot1/Bestpath-skill-app.git
cd Bestpath-skill-app
git checkout claude/wizardly-dijkstra-tz612q
npm install
```

## Part 2 — Supabase (database + auth, free tier)

1. [supabase.com](https://supabase.com) → **New project** → name it `bestpath`,
   save the DB password, pick the region closest to your users
   (Europe/Frankfurt works well for Nigeria).
2. Open **SQL Editor** and run each migration file **in order** (copy the file
   contents, paste, Run):
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_api_usage_fn.sql`
   3. `supabase/migrations/0003_plan_anchor.sql`
3. Email sign-in is on by default, but Supabase's default email only contains
   a link — add the 6-digit code to it: **Authentication → Emails** (or
   "Email Templates") → **Magic Link** template → replace the body with:

   ```html
   <h2>Your Bestpath sign-in code</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Or <a href="{{ .ConfirmationURL }}">click here to sign in directly</a>.</p>
   ```

   Both the code and the link will then work. Google OAuth is optional and
   can be added later. Note: Supabase's built-in sender is limited to a few
   emails per hour — fine for solo testing; connect Resend as custom SMTP
   before real users.
4. From **Project Settings → API**, copy three values: the **Project URL**,
   the **anon** key, and the **service_role** key (keep that one secret).

## Part 3 — Google keys (Gemini + YouTube, both free)

You can reuse an **existing** Google Cloud project — no new project needed.
If you've hit your project limit, that's the way to go.

1. **Pick the project:** [console.cloud.google.com](https://console.cloud.google.com)
   → project picker in the top bar → if your projects don't show, switch the
   dropdown from your organization to **"No organization"** → select an
   existing project (an AI-Studio-created `gen-lang-client-*` project like
   "Gemini API" is ideal — then both keys live together).
2. **YouTube key:** with that project selected, search **"YouTube Data API v3"**
   → **Enable** → then ☰ → **APIs & Services → Credentials →
   + Create Credentials → API key** → copy it.
   *Optional hygiene:* edit the key → API restrictions → restrict to
   YouTube Data API v3.
3. **Gemini key (free, no card):** [aistudio.google.com](https://aistudio.google.com)
   → **Get API key**. If you already have a key attached to the project you
   picked, reuse it; otherwise **Create API key** and choose that same
   project. Free-tier limits comfortably cover a pilot (~50–80 new roadmaps
   a day plus normal activity; the app backs off and retries automatically
   if a limit is hit).

## Part 4 — Configure

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=       ← Project URL (Part 2.4)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  ← anon key
SUPABASE_SERVICE_ROLE_KEY=      ← service_role key
GEMINI_API_KEY=                 ← Part 3.3
YOUTUBE_API_KEY=                ← Part 3.2
```

Leave `ANTHROPIC_API_KEY` and the email section empty — everything except
email nudges works without them. (When there's budget later: set
`ANTHROPIC_API_KEY` + `LLM_PROVIDER=anthropic` to upgrade AI quality — no
code changes.)

## Part 5 — Test the full journey

```bash
npm run dev
```

Open http://localhost:3000 (or your computer's local IP :3000 from your phone).

1. Landing page → type **"video editing"** → Start → sign in with the emailed
   6-digit code.
2. Answer the assessment questions → watch the roadmap stream in.
3. Open **Module 1** — the first visit to a topic takes ~1–2 minutes while it
   searches and live-verifies resources (instant afterwards, for everyone).
4. Click the video links (all should work), tick a lesson complete, downvote
   a resource and watch it get replaced, take the quiz, submit a checkpoint.
5. Check the dashboard reflects your progress.
6. **Become admin:** Supabase → Table Editor → `profiles` → your row →
   `is_admin = true`. Then visit `/admin` to upload Pro Insights.
7. Repeat the short loop for 2–3 more seed skills and judge the quality —
   note anything that reads flat or picks weak videos (that's prompt tuning).

## Part 6 — Deploy (Vercel Hobby, free)

1. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
2. Add the same env vars as Part 4, plus:
   - `NEXT_PUBLIC_APP_URL` — your deployed URL
   - `CRON_SECRET` — any long random string (protects the two daily crons,
     which Vercel activates automatically from `vercel.json`)
3. Supabase → **Authentication → URL Configuration**: set Site URL to the
   Vercel URL and add `https://<your-url>/auth/callback` to redirects.
4. Optional (before pilot): [resend.com](https://resend.com) free tier →
   `RESEND_API_KEY` + `EMAIL_FROM` for welcome/nudge/replan emails.
