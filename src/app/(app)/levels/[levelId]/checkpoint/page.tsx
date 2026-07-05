import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckpointFlow } from "./checkpoint-flow";

export const metadata = { title: "Checkpoint" };

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const { levelId } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: level } = await supabase
    .from("levels")
    .select("id, name, roadmaps ( enrollment_id )")
    .eq("id", levelId)
    .maybeSingle();
  if (!level) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const enrollmentId: string | null =
    (level as any).roadmaps?.enrollment_id ?? null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <CheckpointFlow
      levelId={levelId}
      levelName={level.name}
      enrollmentId={enrollmentId}
    />
  );
}
