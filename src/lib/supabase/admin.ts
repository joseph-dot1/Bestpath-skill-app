import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Service-role client — bypasses RLS. Server-only, used for writes users
 * can't make themselves (creating pending skills, AI-generated roadmap rows,
 * resource pool writes). Returns null when not configured.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
