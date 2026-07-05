import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizFlow } from "./quiz-flow";

export const metadata = { title: "Quiz" };

export default async function QuizPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: mod } = await supabase
    .from("modules")
    .select("id, title")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) notFound();

  return <QuizFlow moduleId={moduleId} moduleTitle={mod.title} />;
}
