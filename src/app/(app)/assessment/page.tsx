import { SEED_SKILLS } from "@/lib/seed-skills";
import { AssessmentFlow } from "./assessment-flow";
import { SkillPicker } from "./skill-picker";

export const metadata = { title: "Assessment" };

export default async function AssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const { skill } = await searchParams;
  const trimmed = skill?.trim() ?? "";

  if (!trimmed) {
    return <SkillPicker />;
  }

  // ?skill= is either a seed-skill slug or free text typed on the landing page.
  const seeded = SEED_SKILLS.find((s) => s.slug === trimmed);
  const skillTitle = seeded?.title ?? trimmed;
  const skillKey = seeded?.slug ?? trimmed;

  return <AssessmentFlow skillKey={skillKey} skillTitle={skillTitle} />;
}
