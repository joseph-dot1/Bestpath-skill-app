import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InsightManager } from "./insight-manager";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Admin-only; everyone else sees a 404, not a hint that this exists.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) notFound();

  const [{ data: skills }, { data: insights }] = await Promise.all([
    supabase.from("skills").select("id, title").order("title"),
    supabase
      .from("pro_insights")
      .select(
        "id, skill_id, author_name, author_title, format, body, is_premium, published_at, skills ( title )",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Admin · Pro Insights</h1>
      <p className="mt-1 text-sm text-muted">
        Upload and publish insights from your pilot professionals.
      </p>
      <InsightManager
        skills={skills ?? []}
        insights={(insights ?? []).map((i) => ({
          id: i.id,
          author_name: i.author_name,
          author_title: i.author_title,
          is_premium: i.is_premium,
          published: Boolean(i.published_at),
          skillTitle:
            (Array.isArray(i.skills)
              ? i.skills[0]?.title
              : (i.skills as { title: string } | null)?.title) ?? "?",
        }))}
      />
    </div>
  );
}
