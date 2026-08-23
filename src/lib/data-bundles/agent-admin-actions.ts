"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { notify, sendSms } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { normaliseSlug, round2, slugProblem } from "@/lib/data-bundles/agents";

/**
 * Admin actions for the sub-agent programme: suspend an agent, correct a
 * balance, process a MoMo withdrawal, publish an announcement.
 *
 * Every one guards with `requireAdmin()` — these move real money — and every
 * balance change goes through `postLedgerEntry`, so an adjustment is as
 * auditable as a commission.
 */

export type AgentAdminState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** A freshly issued setup link, for the admin to pass on. */
  setupUrl?: string;
};

const STORAGE_ERROR =
  "Couldn't save — the agent tables aren't set up on this database yet. " +
  "Run the Neon catch-up SQL (nikimart-neon-data-agents.sql), then try again.";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function revalidateAgents(agentId?: string) {
  revalidatePath("/admin/data/agents");
  revalidatePath("/admin/data/withdrawals");
  if (agentId) revalidatePath(`/admin/data/agents/${agentId}`);
  revalidatePath("/agent");
  revalidatePath("/agent/wallet");
}

// ---------------------------------------------------------------------------
// Agent status
// ---------------------------------------------------------------------------

/**
 * Suspend or reactivate an agent. A suspended agent keeps their balance and
 * history but their storefront closes and they stop earning on new deliveries.
 */
export async function setAgentStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "agentId");
  const status = str(fd, "status");
  if (!id || !["active", "suspended"].includes(status)) return;

  try {
    const agent = await prisma.dataAgent.update({
      where: { id },
      data: { status },
      select: { slug: true, storeName: true, supportPhone: true },
    });
    revalidateAgents(id);
    revalidatePath(`/store/${agent.slug}`);

    if (agent.supportPhone) {
      await sendSms(
        agent.supportPhone,
        status === "active"
          ? `NikiMart: your agent account (${agent.storeName}) is active again. Your store is back online.`
          : `NikiMart: your agent account (${agent.storeName}) has been suspended. Please contact support.`,
      );
    }
  } catch {
    // Agent gone, or tables not migrated — nothing to undo.
  }
}

// ---------------------------------------------------------------------------
// Balance adjustments
// ---------------------------------------------------------------------------

/**
 * Credit or debit an agent by hand — a goodwill credit, a correction, waiving
 * the rest of a setup fee. The narration is required because a ledger entry
 * nobody can explain later is worse than no entry at all.
 */
export async function adjustAgentBalance(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();

  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const amount = num(fd, "amount");
  if (amount === null || amount === 0) {
    return { error: "Enter an amount — negative to debit, positive to credit." };
  }
  if (Math.abs(amount) > 100000) return { error: "That adjustment looks too large." };

  const narration = str(fd, "narration");
  if (narration.length < 4) return { error: "Say what this adjustment is for." };

  try {
    const balance = await postLedgerEntry({
      agentId,
      type: "ADJUSTMENT",
      amount: round2(amount),
      narration,
      reference: null,
    });
    revalidateAgents(agentId);
    return {
      ok: true,
      message: `${amount > 0 ? "Credited" : "Debited"} ${formatMoney(Math.abs(round2(amount)))}. New balance ${formatMoney(balance ?? 0)}.`,
    };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

/**
 * Mark a withdrawal paid. The money already left the agent's balance when they
 * requested it, so this only records that the MoMo transfer was actually made.
 */
export async function processWithdrawal(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "withdrawalId");
  if (!id) return;

  try {
    // Guarded so two admins working the queue can't both mark one paid.
    const claimed = await prisma.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "processed",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note"),
      },
    });
    if (claimed.count === 0) return;

    const row = await prisma.dataAgentWithdrawal.findUnique({
      where: { id },
      select: { agentId: true, amount: true, momoPhone: true },
    });
    revalidateAgents(row?.agentId);
    if (row) {
      await sendSms(
        row.momoPhone,
        `NikiMart: ${formatMoney(row.amount)} has been sent to ${row.momoPhone}. Thank you for selling with us.`,
      );
    }
  } catch {
    // Not migrated — nothing to record.
  }
}

/**
 * Reject a withdrawal and put the money back. The reversal is a ledger entry of
 * its own rather than an edit, so the request and its refund both stay visible
 * on the agent's wallet.
 */
export async function rejectWithdrawal(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "withdrawalId");
  if (!id) return;

  try {
    const claimed = await prisma.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note") || "Rejected",
      },
    });
    if (claimed.count === 0) return;

    const row = await prisma.dataAgentWithdrawal.findUnique({
      where: { id },
      select: { agentId: true, amount: true, fee: true, momoPhone: true },
    });
    if (!row) return;

    await postLedgerEntry({
      agentId: row.agentId,
      type: "WITHDRAWAL_REVERSAL",
      amount: round2(row.amount + row.fee),
      narration: `Withdrawal to ${row.momoPhone} was rejected — amount returned to your balance`,
      reference: id,
    });

    revalidateAgents(row.agentId);
    await sendSms(
      row.momoPhone,
      `NikiMart: your withdrawal of ${formatMoney(row.amount)} could not be processed. The amount is back on your balance.`,
    );
  } catch {
    // Not migrated — nothing to reverse.
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function saveAnnouncement(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();

  const title = str(fd, "title");
  const body = str(fd, "body");
  if (title.length < 3) return { error: "Give the announcement a title." };
  if (body.length < 5) return { error: "Write the announcement." };

  const tone = ["info", "warning", "success"].includes(str(fd, "tone")) ? str(fd, "tone") : "info";
  const id = str(fd, "id");

  try {
    if (id) {
      await prisma.dataAnnouncement.update({
        where: { id },
        data: { title, body, tone, isPinned: fd.get("isPinned") === "on" },
      });
    } else {
      await prisma.dataAnnouncement.create({
        data: { title, body, tone, isPinned: fd.get("isPinned") === "on" },
      });
    }
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
    return { ok: true, message: id ? "Announcement updated." : "Announcement published." };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

export async function setAnnouncementActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataAnnouncement.update({
      where: { id },
      data: { isActive: str(fd, "isActive") === "1" },
    });
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
  } catch {
    // Gone, or not migrated.
  }
}

export async function deleteAnnouncement(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataAnnouncement.delete({ where: { id } });
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
  } catch {
    // Already gone.
  }
}

// ---------------------------------------------------------------------------
// Support requests
// ---------------------------------------------------------------------------

export async function resolveSupportRequest(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataSupportRequest.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date(), adminNote: str(fd, "note") },
    });
    revalidatePath("/admin/data/support");
  } catch {
    // Gone, or not migrated.
  }
}

// ---------------------------------------------------------------------------
// Managing an agent like any other account
// ---------------------------------------------------------------------------

/**
 * Issue a fresh setup link for an agent who still has no password.
 *
 * The link normally goes out by SMS and email on approval. When neither is
 * configured — or the text simply never arrived, which happens — there was no
 * second chance: the account existed, nobody could sign in to it, and the only
 * way out was a database edit. This is that second chance.
 */
export async function reissueSetupLink(fd: FormData): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  let agent;
  try {
    agent = await prisma.dataAgent.findUnique({
      where: { id: agentId },
      select: { id: true, storeName: true, slug: true, userId: true, user: { select: { email: true, phone: true, passwordHash: true } } },
    });
  } catch {
    return { error: "Couldn't read that agent." };
  }
  if (!agent) return { error: "That agent no longer exists." };
  if (agent.user?.passwordHash) {
    return { error: "This agent already has a password — send them to Forgot password instead." };
  }

  const token = randomBytes(32).toString("hex");
  const setupUrl = `${siteUrl()}/agent-setup?token=${token}`;

  try {
    // The link belongs to an application, which is where the token lives. If
    // the agent was created some other way, make a record to hang it on.
    const existing = await prisma.dataAgentApplication.findFirst({
      where: { agentId },
      select: { id: true },
    });
    const data = {
      setupTokenHash: createHash("sha256").update(token).digest("hex"),
      setupExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    };
    if (existing) {
      await prisma.dataAgentApplication.update({ where: { id: existing.id }, data });
    } else {
      await prisma.dataAgentApplication.create({
        data: {
          fullName: agent.storeName,
          phone: agent.user?.phone ?? "",
          email: agent.user?.email ?? "",
          desiredSlug: agent.slug,
          status: "approved",
          agentId,
          ...data,
        },
      });
    }
  } catch {
    return { error: "Couldn't issue a new link. Please try again." };
  }

  await Promise.allSettled([
    sendSms(agent.user?.phone, `NikiMart: set your agent password here — ${setupUrl}`),
    notify(
      { email: agent.user?.email ?? null, phone: null },
      {
        sms: `Set your NikiMart agent password: ${setupUrl}`,
        emailSubject: "Set your NikiMart agent password",
      },
    ),
  ]);

  revalidateAgents(agentId);
  return { ok: true, setupUrl, message: "New link issued — valid for 7 days." };
}

const editSchema = z.object({
  storeName: z.string().trim().min(2, "Give the store a name.").max(60),
  slug: z.string().trim().min(3, "Choose a store link."),
  supportPhone: z.string().trim().optional(),
  supportWhatsapp: z.string().trim().optional(),
  storeTagline: z.string().trim().max(120).optional(),
});

/** Edit an agent's store details on their behalf. */
export async function updateAgentDetails(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const parsed = editSchema.safeParse({
    storeName: fd.get("storeName"),
    slug: fd.get("slug"),
    supportPhone: fd.get("supportPhone") ?? "",
    supportWhatsapp: fd.get("supportWhatsapp") ?? "",
    storeTagline: fd.get("storeTagline") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const slug = normaliseSlug(data.slug);
  const problem = slugProblem(slug);
  if (problem) return { error: problem };

  // Both are optional, but a stored number has to be a real one.
  let support = "";
  if (data.supportPhone) {
    const check = parseGhPhone(data.supportPhone);
    if (!check.ok) return { error: `Support number: ${check.message}` };
    support = check.local;
  }
  let whatsapp = "";
  if (data.supportWhatsapp) {
    const check = parseGhPhone(data.supportWhatsapp);
    if (!check.ok) return { error: `WhatsApp number: ${check.message}` };
    whatsapp = check.local;
  }

  try {
    const clash = await prisma.dataAgent.findFirst({
      where: { slug, NOT: { id: agentId } },
      select: { id: true },
    });
    if (clash) return { error: `“${slug}” is already taken by another store.` };

    await prisma.dataAgent.update({
      where: { id: agentId },
      data: {
        storeName: data.storeName,
        slug,
        supportPhone: support,
        supportWhatsapp: whatsapp,
        storeTagline: data.storeTagline ?? "",
      },
    });
  } catch {
    return { error: "Couldn't save those details. Please try again." };
  }

  revalidateAgents(agentId);
  revalidatePath(`/store/${slug}`);
  return { ok: true, message: "Agent details saved." };
}

/**
 * Close an agent's storefront for good.
 *
 * The person keeps their NikiMart account — being an agent is something a user
 * has, not something they are, so this removes the storefront and leaves them
 * a customer. Their prices, ledger and withdrawal history go with it; orders
 * they sold stay, unattributed, because those are the customers' records too.
 *
 * Refused while money is unsettled. A negative balance is an unpaid setup fee
 * and a positive one is commission owed; deleting either would quietly write
 * off somebody's money, which is not a thing a delete button should do.
 */
export async function deleteAgent(_prev: AgentAdminState, fd: FormData): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  try {
    const agent = await prisma.dataAgent.findUnique({
      where: { id: agentId },
      select: { id: true, storeName: true, balance: true },
    });
    if (!agent) return { error: "That agent no longer exists." };

    if (Math.abs(agent.balance) >= 0.01) {
      return {
        error:
          agent.balance > 0
            ? `${agent.storeName} is still owed ${formatMoney(agent.balance)}. Pay it out or adjust the balance to zero first.`
            : `${agent.storeName} still owes ${formatMoney(-agent.balance)}. Write it off with a balance adjustment first.`,
      };
    }

    const pending = await prisma.dataAgentWithdrawal.count({
      where: { agentId, status: "pending" },
    });
    if (pending > 0) {
      return { error: "There's a withdrawal still waiting. Process or reject it first." };
    }

    await prisma.dataAgent.delete({ where: { id: agentId } });
  } catch {
    return { error: "Couldn't remove that agent. Please try again." };
  }

  revalidateAgents(agentId);
  // Outside the try: this page is about the agent that no longer exists, so
  // staying on it means staring at a 404. redirect() works by throwing, and a
  // catch above would swallow it.
  redirect("/admin/data/agents?removed=1");
}
