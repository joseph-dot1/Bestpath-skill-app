import "server-only";

// Thin Resend wrapper (REST — no SDK dependency). All sends are best-effort:
// email failures never break a user-facing flow.

const FROM = process.env.EMAIL_FROM ?? "Bestpath <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("resend send failed:", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    console.error("resend send error:", err);
    return false;
  }
}

// Minimal, low-bandwidth-friendly template: text-first, one accent button.
function template(heading: string, body: string, ctaText: string, ctaPath: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d1a">
  <p style="font-size:18px;font-weight:bold;margin:0 0 4px">best<span style="color:#7bb52a">path</span></p>
  <h1 style="font-size:20px;margin:20px 0 8px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#444">${body}</p>
  <a href="${APP_URL}${ctaPath}" style="display:inline-block;margin-top:16px;background:#b4f24c;color:#101505;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:10px;text-decoration:none">${ctaText}</a>
  <p style="font-size:11px;color:#999;margin-top:28px">You're receiving this because you have an active roadmap on Bestpath.</p>
</div>`;
}

export function sendWelcomeEmail(to: string, skillTitle: string, enrollmentId: string) {
  return send(
    to,
    `Your ${skillTitle} roadmap is ready 🧭`,
    template(
      `Your ${skillTitle} roadmap is ready`,
      `You answered the questions, we built the path. Every video on it is verified and ranked — your only job is to show up for week one.`,
      "Open my roadmap",
      `/skills/${enrollmentId}`,
    ),
  );
}

export function sendIdleNudgeEmail(to: string, skillTitle: string, enrollmentId: string) {
  return send(
    to,
    `Your next ${skillTitle} lesson is waiting`,
    template(
      "Pick up where you left off",
      `Your ${skillTitle} roadmap hasn't moved in a few days. One lesson tonight keeps the plan alive — it's shorter than you think.`,
      "Continue learning",
      `/skills/${enrollmentId}`,
    ),
  );
}

export function sendReplanEmail(to: string, skillTitle: string, enrollmentId: string) {
  return send(
    to,
    `Life happened? Reset your ${skillTitle} plan in one tap`,
    template(
      "Your plan can bend without breaking",
      `You've fallen behind the week-by-week plan for ${skillTitle} — that's normal, not a failure. Replan and the schedule restarts from today with what's left.`,
      "Replan my weeks",
      `/skills/${enrollmentId}`,
    ),
  );
}
