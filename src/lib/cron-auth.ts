import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Who may run a scheduled job.
 *
 * Three of these four routes used to be open when `CRON_SECRET` was unset —
 * `if (secret) { check }`, so no secret meant no check — and the reasoning was
 * written down: all they do is re-drive work that was already paid for, so
 * triggering one early achieves nothing a patient attacker could not get by
 * waiting. As far as *correctness* goes that is still true.
 *
 * What changed is the cost of the work itself. The retail database runs on an
 * allowance measured in compute-hours, and in October it ran out: the project
 * was suspended, nobody could sign in, and the storefront served an empty
 * catalogue for a day. An unauthenticated endpoint that makes the database do
 * a full sweep on demand is, in that light, not harmless at all — it is a way
 * for a stranger to spend the thing the whole site depends on, a few requests
 * at a time, and `/api/cron/rates` additionally spends an external API quota.
 *
 * So the rule is now the one `/api/cron/data-backup` already followed: the
 * secret is required, and with none set the route refuses rather than opening.
 * That is a deliberate operational trade — a deployment that has not set
 * `CRON_SECRET` will see its scheduled jobs start failing with a 503 that says
 * exactly why, which is a better failure than an open endpoint nobody notices.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Constant-time, because the comparison is against a secret. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Returns a response to send back when the caller may *not* run the job, or
 * null when it may. Callers read it as: `const no = denyCron(req); if (no) return no;`
 */
export function denyCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set. This job will not run until it is, because the endpoint must not be open.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (!matches(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  return null;
}
