// The ten launch skills. Must stay in sync with the seed rows in
// supabase/migrations/0001_init.sql — the landing page renders from this list
// so it works before Supabase is configured.
export const SEED_SKILLS = [
  { slug: "video-editing", title: "Video Editing" },
  { slug: "meta-google-ads", title: "Meta & Google Ads" },
  { slug: "copywriting", title: "Copywriting" },
  { slug: "graphic-design", title: "Graphic Design" },
  { slug: "data-analysis", title: "Data Analysis" },
  { slug: "frontend-development", title: "Frontend Development" },
  { slug: "ui-ux-design", title: "UI/UX Design" },
  { slug: "social-media-management", title: "Social Media Management" },
  { slug: "vibe-coding", title: "Vibe Coding" },
  { slug: "ai-prompt-engineering", title: "AI & Prompt Engineering" },
] as const;
