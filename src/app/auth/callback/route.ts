import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth redirect target. Handles both formats Supabase sends:
 *  - OAuth / PKCE magic links:  ?code=...
 *  - OTP-style magic links:     ?token_hash=...&type=email
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  // Same-site relative paths only (prevents open redirects).
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";

  const supabase = await createClient();
  if (supabase) {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
