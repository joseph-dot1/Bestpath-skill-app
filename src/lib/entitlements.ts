import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type Tier = "free" | "pro";

/**
 * Entitlements. Free = full roadmap skeleton + the Beginner level unlocked;
 * Pro = every level + premium Pro Insights. Reads the subscriptions table —
 * payments (Paystack primary, Stripe secondary) plug in behind this in v1.1
 * without touching any call site.
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<Tier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.tier === "pro" && data.status === "active" ? "pro" : "free";
}

export function canAccessLevel(tier: Tier, levelIsFree: boolean): boolean {
  return levelIsFree || tier === "pro";
}
