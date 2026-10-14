import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/lib/affiliate";
import {
  VISITOR_COOKIE,
  isLinkCode,
  isReferralCode,
  recordAffiliateVisit,
} from "@/lib/affiliate-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The link an affiliate actually shares: nickimart.com/r/ABC123.
 *
 * Short, because it is pasted into WhatsApp beside a flyer, and because a
 * product URL with a query string on the end gets mangled by half the apps it
 * passes through. But the real reason it is a route rather than `?ref=` is
 * that this runs on the server: the click is recorded and the attribution
 * cookie is set *before* the shopper reaches the product, so nothing depends
 * on JavaScript running, on a referrer being sent, or on an in-app browser
 * that strips query strings.
 *
 * A code that resolves to nothing still goes to the storefront. Somebody who
 * followed a link from a flyer should land on Nickimart either way; an error
 * page would only tell them the affiliate's link was broken.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = (raw ?? "").trim().toUpperCase().slice(0, 24);
  const url = new URL(req.url);
  // Where the affiliate pointed it, when they pointed it somewhere specific.
  const to = url.searchParams.get("to");
  const channel = url.searchParams.get("c");

  const visit =
    isLinkCode(code) || isReferralCode(code)
      ? await recordAffiliateVisit({
          linkCode: isLinkCode(code) ? code : null,
          code,
          path: url.pathname,
          channel,
          visitorId: cookieValue(req, VISITOR_COOKIE),
        })
      : null;

  const destination = new URL(
    visit?.productSlug
      ? `/products/${visit.productSlug}`
      : safeInternalPath(to) ?? "/products",
    url.origin,
  );
  // The code rides along in the query as well, so the storefront's own capture
  // and anything that reads it client-side still see it.
  if (visit) destination.searchParams.set("ref", visit.affiliateCode);

  const response = NextResponse.redirect(destination, { status: 302 });
  if (visit) {
    const options = {
      path: "/",
      sameSite: "lax" as const,
      // The browser ceiling rather than the policy window: the attribution row
      // carries its own expiry and is what actually decides, so a cookie that
      // outlives the window is harmless and one that dies inside it is not.
      maxAge: 400 * 86_400,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    };
    response.cookies.set(REFERRAL_COOKIE, visit.affiliateCode, options);
    response.cookies.set(VISITOR_COOKIE, visit.visitorId, options);
  }
  // Never cached: this sets a cookie and records a click, and a shared CDN
  // copy would hand one affiliate's attribution to the next visitor.
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

/** An internal path and nothing else — an open redirect is not a feature. */
function safeInternalPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value.slice(0, 300);
}
