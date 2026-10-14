import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/lib/affiliate";
import { VISITOR_COOKIE, isReferralCode, recordAffiliateVisit } from "@/lib/affiliate-attribution";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the storefront's `?ref=CODE` capture lands.
 *
 * `/r/<code>` handles the links the console mints, but codes also travel on
 * their own — printed on a flyer, typed into a story, pasted into a bio — and
 * those arrive as a query string on an ordinary page. The browser wrote a
 * cookie for that case already; this gives the visit the same server-side
 * record every other click gets, so the attribution survives a cleared cookie
 * and the click shows up in the affiliate's own figures.
 *
 * Rate limited per address: it writes a row, and a page that calls it once per
 * visit should never be the reason anybody can write thousands.
 */
export async function POST(req: Request) {
  let body: { code?: unknown; path?: unknown; channel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const code = String(body.code ?? "").trim().toUpperCase().slice(0, 16);
  if (!isReferralCode(code)) return NextResponse.json({ ok: false }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const allowed = await rateLimit(`affiliate-track:${ip}`, 60, 60_000).catch(() => ({ ok: true }));
  if (!allowed.ok) return NextResponse.json({ ok: false }, { status: 429 });

  const existing = cookieValue(req, VISITOR_COOKIE);
  const visit = await recordAffiliateVisit({
    code,
    path: typeof body.path === "string" ? body.path.slice(0, 300) : "",
    channel: typeof body.channel === "string" ? body.channel : null,
    visitorId: existing,
  });

  const response = NextResponse.json({ ok: Boolean(visit) });
  if (visit) {
    const options = {
      path: "/",
      sameSite: "lax" as const,
      maxAge: 400 * 86_400,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    };
    response.cookies.set(REFERRAL_COOKIE, visit.affiliateCode, options);
    response.cookies.set(VISITOR_COOKIE, visit.visitorId, options);
  }
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
