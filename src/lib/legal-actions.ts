"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { POLICY_DEFAULTS, toBody } from "@/lib/legal";

/**
 * Editing a policy.
 *
 * Admin-only, and deliberately limited to the policies the app knows about:
 * the slug is what the footer and the registration forms link to, so a policy
 * with an invented slug would be a document nobody can reach.
 */

export type PolicyState = { ok?: boolean; error?: string; message?: string };

const schema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(2, "Give the policy a title.").max(120),
  intro: z.string().trim().max(300).optional(),
  body: z.string().trim().min(20, "A policy needs more than a line of text."),
});

export async function savePolicy(_prev: PolicyState, fd: FormData): Promise<PolicyState> {
  const admin = await requireAdmin();

  const parsed = schema.safeParse({
    slug: fd.get("slug"),
    title: fd.get("title"),
    intro: fd.get("intro") ?? "",
    body: fd.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  if (!POLICY_DEFAULTS[data.slug]) return { error: "Unknown policy." };

  try {
    await prisma.legalPolicy.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        intro: data.intro ?? "",
        body: data.body,
        updatedBy: admin.name ?? admin.email ?? admin.id,
      },
      update: {
        title: data.title,
        intro: data.intro ?? "",
        body: data.body,
        updatedBy: admin.name ?? admin.email ?? admin.id,
      },
    });
  } catch {
    return {
      error:
        "Couldn't save — the policy table isn't set up on this database yet. " +
        "Run nikimart-neon-legal-policies.sql, then try again.",
    };
  }

  revalidatePath(`/legal/${data.slug}`);
  return { ok: true, message: `${data.title} saved and published.` };
}

/** Throw the edits away and go back to the text Nickimart ships with. */
export async function resetPolicy(_prev: PolicyState, fd: FormData): Promise<PolicyState> {
  await requireAdmin();
  const slug = String(fd.get("slug") ?? "").trim();
  const fallback = POLICY_DEFAULTS[slug];
  if (!fallback) return { error: "Unknown policy." };

  try {
    // Deleting the row rather than rewriting it: with no row, getPolicy falls
    // back to the built-in text, which is the same thing and stays in step if
    // that text is ever improved.
    await prisma.legalPolicy.delete({ where: { slug } }).catch(() => {});
  } catch {
    return { error: "Couldn't reset that policy. Please try again." };
  }

  revalidatePath(`/legal/${slug}`);
  return { ok: true, message: `${fallback.title} is back to the standard wording.` };
}

/** The built-in text, for the "restore" preview in the editor. */
export async function defaultPolicyBody(slug: string): Promise<string> {
  const d = POLICY_DEFAULTS[slug];
  return d ? toBody(d.sections) : "";
}
