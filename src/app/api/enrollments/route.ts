import { NextResponse } from "next/server";
import type { AssessmentTurn, LearnerProfile } from "@/lib/assessment/engine";
import { sendWelcomeEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * POST /api/enrollments
 * Body: { skill: string (slug or free-text title), profile: LearnerProfile,
 *         transcript: AssessmentTurn[] }
 * Resolves the skill (creating a pending one for free-text entries), then
 * creates the enrollment carrying the learner profile.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    skill?: unknown;
    profile?: unknown;
    transcript?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const skillInput = typeof body.skill === "string" ? body.skill.trim() : "";
  const profile = body.profile as LearnerProfile | undefined;
  const transcript = Array.isArray(body.transcript)
    ? (body.transcript as AssessmentTurn[])
    : [];

  if (!skillInput || skillInput.length > 120 || !profile?.summary) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // --- Resolve the skill: existing slug/title match, else create pending ---
  const slug = slugify(skillInput);
  const { data: existing } = await supabase
    .from("skills")
    .select("id")
    .or(`slug.eq.${slug},title.ilike.${skillInput.replaceAll(",", " ")}`)
    .limit(1)
    .maybeSingle();

  let skillId = existing?.id as string | undefined;

  if (!skillId) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is not set — required to add new skills." },
        { status: 503 },
      );
    }
    const { data: created, error } = await admin
      .from("skills")
      .upsert(
        { slug, title: skillInput, status: "pending" },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error || !created) {
      console.error("skill create failed:", error);
      return NextResponse.json({ error: "Could not create skill" }, { status: 500 });
    }
    skillId = created.id;
  }

  // --- Create the enrollment (user-scoped client; RLS enforces ownership) ---
  const { data: enrollment, error: enrollError } = await supabase
    .from("enrollments")
    .upsert(
      {
        user_id: user.id,
        skill_id: skillId,
        goal: profile.goal,
        weekly_hours: profile.weekly_hours,
        prior_level: profile.prior_level,
        format_pref: profile.format_pref,
        assessment_transcript: {
          turns: transcript,
          profile,
        },
        status: "active",
      },
      { onConflict: "user_id,skill_id" },
    )
    .select("id")
    .single();

  if (enrollError || !enrollment) {
    console.error("enrollment create failed:", enrollError);
    return NextResponse.json({ error: "Could not create enrollment" }, { status: 500 });
  }

  // Analytics + welcome email are best-effort — don't make the learner wait
  // on them before landing in their roadmap.
  void supabase.from("events").insert({
    user_id: user.id,
    name: "assessment_completed",
    props: { skill_id: skillId, questions: transcript.length },
  });
  if (user.email) {
    void sendWelcomeEmail(user.email, skillInput, enrollment.id);
  }

  return NextResponse.json({ enrollmentId: enrollment.id });
}
