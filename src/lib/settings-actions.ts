"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { SETTING_KEYS } from "@/lib/settings";
import type { CrudState } from "@/lib/admin-actions";

export type SettingsState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function revalidateChrome() {
  // The footer + help are rendered on many pages; revalidate broadly.
  revalidatePath("/", "layout");
  revalidatePath("/help");
  revalidatePath("/checkout");
  // Public pages whose copy is settings-driven.
  revalidatePath("/how-it-works");
  revalidatePath("/pickup-points");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettings(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireAdmin();

  for (const [key, label] of [
    ["commissionRate", "Commission rate"],
    ["affiliateRate", "Affiliate commission"],
    ["affiliateMaxRate", "Affiliate headline rate"],
  ] as const) {
    const v = str(fd, key);
    if (v && !(Number(v) >= 0 && Number(v) <= 100)) {
      return { error: `${label} must be between 0 and 100.`, fieldErrors: { [key]: "0–100 only." } };
    }
  }

  for (const key of SETTING_KEYS) {
    // Only touch settings this form actually submitted — otherwise settings
    // managed on other pages (the whole shipping console, for one) would be
    // blanked by a save from here.
    if (!fd.has(key)) continue;
    const value = str(fd, key);
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  revalidateChrome();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

function faqData(fd: FormData) {
  return {
    question: str(fd, "question"),
    answer: str(fd, "answer"),
    order: Number(str(fd, "order")) || 0,
  };
}

export async function createFaq(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = faqData(fd);
  if (data.question.length < 3 || data.answer.length < 3) {
    return { error: "Question and answer are required." };
  }
  const last = await prisma.faq.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  await prisma.faq.create({ data: { ...data, order: data.order || (last?.order ?? -1) + 1 } });
  revalidatePath("/help");
  revalidatePath("/admin/faqs");
  redirect("/admin/faqs");
}

export async function updateFaq(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = faqData(fd);
  if (data.question.length < 3 || data.answer.length < 3) {
    return { error: "Question and answer are required." };
  }
  await prisma.faq.update({ where: { id }, data });
  revalidatePath("/help");
  revalidatePath("/admin/faqs");
  redirect("/admin/faqs");
}

export async function deleteFaq(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.faq.delete({ where: { id } });
    revalidatePath("/help");
    revalidatePath("/admin/faqs");
  }
}
